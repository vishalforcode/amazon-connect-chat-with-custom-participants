import {
    ConnectParticipantClient,
    DisconnectParticipantCommand,
    SendMessageCommand,
    SendEventCommand,
} from "@aws-sdk/client-connectparticipant";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SNSEvent, ConnectContactFlowResult, ConnectContactFlowEvent, SQSEvent } from "aws-lambda";
import { ConnectClient, StopContactStreamingCommand, StartChatContactCommand } from "@aws-sdk/client-connect";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient();

type StepData = {
    connectionToken: string;
    contactId: string;
    lastMessageId?: string;
    continue?: boolean;
};

const unmarshallOptions = {
    wrapNumbers: false,
};

const marshallOptions = {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false,
};

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions, unmarshallOptions });
const connectClient = new ConnectClient({});
const connectParticipantClient = new ConnectParticipantClient({});
const bedrockClient = new BedrockRuntimeClient({});

const chatContactsTableName = process.env.CHAT_CONTACTS_TABLE_NAME;
const instanceId = process.env.INSTANCE_ID;
const botArn = process.env.PROXY_BOT_ARN;
const contactFlowArn = process.env.CONTACT_FLOW_ARN
const targetFlowArn = process.env.TARGET_FLOW_ARN
const queueArn = process.env.QUEUE_ARN

async function connectToAgent(connectionToken: string, messageObject: any): Promise<undefined | any> {

    // Fetch the contact flow ID from environment variables or configuration
    const contactFlowId = contactFlowArn?.split('/').pop();
    // const queueId = queueArn?.split('/').pop(); // Get queue ID if needed
    const targetFlowId = targetFlowArn?.split('/').pop();

    // Send a message saying the user is being transferred
    await sendMessage(connectionToken, "Transferring to an agent...");

    try {
        // Start a chat contact with the contact flow and optionally route to a queue
        const startChatCommand = new StartChatContactCommand(
            {
                InstanceId: instanceId, // Required: Instance ID
                ContactFlowId: targetFlowId, // Required: Contact Flow ID
                // Attributes: {
                //     "queueId": queueId as string,
                // },
                ParticipantDetails: {
                    DisplayName: "Customer", // Required: Display name of the customer
                },
                InitialMessage: {
                    ContentType: "text/plain", // Required: The message content type
                    Content: "Hello, how can I help you?", // Required: Initial message content
                }
            });

        const response = await connectClient.send(startChatCommand);
        console.log("Chat contact started:", response);
    } catch (error) {
        console.error("Error transferring contact to agent:", error);
    }

}



export async function handler(event: SNSEvent): Promise<void> {
    for (const record of event.Records) {
        const messageObject = JSON.parse(record.Sns.Message);
        console.log("Message", messageObject);

        if (messageObject.ContactId && messageObject.Content) {
            const chatContact = await getChatContact(messageObject.ContactId);

            if (chatContact?.connectionToken) {
                if (messageObject.Content.toLowerCase() === "connect to agent") {
                    await disconnect(chatContact.connectionToken);
                    await stopChatStreaming(chatContact.contactId, chatContact.streamingId);
                } else {
                    await sendEvent(chatContact.connectionToken);
                    const response = await invokeModelWithLambda(messageObject.Content);
                    await sendMessage(chatContact.connectionToken, response ?? 'error generating answer');
                }
            } else {
                console.error("No connection token found", messageObject.ContactId);
            }
        } else {
            console.error("Invalid message");
        }
    }
}

async function getChatContact(contactId: string): Promise<undefined | any> {
    const command = new GetCommand({
        TableName: chatContactsTableName,
        Key: {
            contactId,
        },
    });

    try {
        const response = await ddbDocClient.send(command);
        console.debug("Getting chat contact", { command, response });

        return response?.Item;
    } catch (error) {
        console.error("Getting chat contact", { command, error: (error as Error).message });
    }

    return undefined;
}

async function sendEvent(connectionToken: string) {
    const command = new SendEventCommand({
        ConnectionToken: connectionToken,
        ContentType: 'application/vnd.amazonaws.connect.event.typing',
    });

    try {
        const response = await connectParticipantClient.send(command);
        console.debug("Sending event", { command, response });
    } catch (error) {
        console.error("Sending event", { command, error: (error as Error).message });
    }
}

async function invokeModel(question: string): Promise<string | undefined> {
    const command = new InvokeModelCommand({
        body: JSON.stringify({
            prompt: `\n\nHuman: ${question} Also provide a very concise answer in less than 500 characters.\n\nAssistant:`,
            max_tokens_to_sample: 300,
        }),
        contentType: 'application/json',
        accept: 'application/json',
        modelId: 'amazon.titan-text-lite-v1',
    });

    try {
        const response = await bedrockClient.send(command);
        console.debug("Invoking model", { command, response });

        // Save the raw response
        const rawRes = response.body;

        // Convert it to a JSON String
        const jsonString = new TextDecoder().decode(rawRes);

        // Parse the JSON string
        const parsedResponse = JSON.parse(jsonString);

        return parsedResponse.completion;
    } catch (error) {
        console.error("Invoking model", { command, error: (error as Error).message });
    }

    return undefined;
}

async function invokeModelWithLambda(question: string): Promise<string | undefined> {
    const payload = {
        "query": question,
    };

    const command = new InvokeCommand({
        FunctionName: botArn, // Replace with your Lambda function name or ARN
        Payload: Buffer.from(JSON.stringify(payload)),
    });

    try {
        const response = await lambdaClient.send(command);
        const responsePayload = JSON.parse(
            new TextDecoder("utf-8").decode(response.Payload)
        );

        const parsedResponse = JSON.parse(responsePayload.body);

        console.debug("response from proxy", parsedResponse)

        return parsedResponse.summary;
    } catch (error) {
        console.error("Error invoking Lambda", error);
        return undefined;
    }
}

async function sendMessage(connectionToken: string, message: string, type = "text/plain"): Promise<undefined | string> {
    const command = new SendMessageCommand({
        ContentType: type,
        Content: message,
        ConnectionToken: connectionToken,
    });

    try {
        const response = await connectParticipantClient.send(command);
        console.debug("Sending message", { command, response });

        return response.Id;
    } catch (error) {
        console.error("Sending message", { command, error: (error as Error).message });
    }

    return undefined;
}

async function disconnect(connectionToken: string) {
    const command = new DisconnectParticipantCommand({
        ConnectionToken: connectionToken,
    });

    try {
        const response = await connectParticipantClient.send(command);
        console.debug("Disconnecting bot", { command, response });
    } catch (error) {
        console.error("Disconnecting bot", { command, error: (error as Error).message });
    }
}

async function stopChatStreaming(contactId: string, streamingId: string): Promise<void> {
    const command = new StopContactStreamingCommand({
        ContactId: contactId,
        InstanceId: instanceId,
        StreamingId: streamingId,
    });

    try {
        const response = await connectClient.send(command);
        console.debug("Stopping chat streaming", { command, response });
    } catch (error) {
        console.error("Stopping chat streaming", { command, error: (error as Error).message });
    }
}
