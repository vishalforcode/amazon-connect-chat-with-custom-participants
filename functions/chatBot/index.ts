import {
    ConnectParticipantClient,
    DisconnectParticipantCommand,
    SendMessageCommand,
    SendEventCommand,
} from "@aws-sdk/client-connectparticipant";
import { BedrockRuntimeClient, InvokeModelCommand  } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SNSEvent } from "aws-lambda";
import { ConnectClient, StopContactStreamingCommand } from "@aws-sdk/client-connect";

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

export async function handler(event: SNSEvent): Promise<void> {
    for(const record of event.Records) {
        const messageObject = JSON.parse(record.Sns.Message);
        console.log("Message", messageObject);

        if(messageObject.ContactId && messageObject.Content) {
            const chatContact = await getChatContact(messageObject.ContactId);

            if(chatContact?.connectionToken) {
                if(messageObject.Content.toLowerCase() === "quit") {
                    await disconnect(chatContact.connectionToken);
                    await stopChatStreaming(chatContact.contactId, chatContact.streamingId);
                } else {
                    await sendEvent(chatContact.connectionToken);
                    const response = await invokeModel(messageObject.Content);
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

async function invokeModel(question: string): Promise<string|undefined> {
    const command = new InvokeModelCommand({
        body: JSON.stringify({
            prompt: `\n\nHuman: ${question} Also provide a very concise answer in less than 500 characters.\n\nAssistant:`,
            max_tokens_to_sample: 300,
        }),
        contentType: 'application/json',
        accept: 'application/json',
        modelId: 'anthropic.claude-v2',
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
