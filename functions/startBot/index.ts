import { ConnectContactFlowEvent, ConnectContactFlowResult, Context } from "aws-lambda";
import { CreateParticipantCommand, CreateParticipantCommandOutput, ConnectClient, StartContactStreamingCommand } from "@aws-sdk/client-connect";
import {
    ConnectParticipantClient,
    CreateParticipantConnectionCommand,
    CreateParticipantConnectionCommandOutput,
    SendMessageCommand,
} from "@aws-sdk/client-connectparticipant";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

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

const instanceId = process.env.INSTANCE_ID;
const chatContactsTableName = process.env.CHAT_CONTACTS_TABLE_NAME;
const chatStreamingTopicArn = process.env.CHAT_STREAMING_TOPIC_ARN;

export async function handler(event: ConnectContactFlowEvent): Promise<ConnectContactFlowResult> {
    console.info("Starting request", { event });

    const contactId = event.Details.ContactData?.ContactId;

    let status = "failure";

    // create participant
    const particiantDetail = await createParticipant(contactId);

    if (particiantDetail?.ParticipantId && particiantDetail?.ParticipantCredentials?.ParticipantToken) {
        // start chat streaming
        const streamingId = await startChatStreaming(contactId);

        // create participant connect
        const participantConnection = await createParticipantConnection(
            particiantDetail.ParticipantCredentials.ParticipantToken,
        );

        if (participantConnection?.ConnectionCredentials?.ConnectionToken && streamingId) {
            status = "success";

            // store results
            await saveChatContactDetails(contactId, participantConnection.ConnectionCredentials.ConnectionToken, streamingId);

            // send initial message
            await sendMessage(participantConnection.ConnectionCredentials.ConnectionToken, 'I\'m an automated assistant. Ask me questions or reply "quit" to exit.');
        }
    }

    const response: ConnectContactFlowResult = {
        status,
    };

    console.info("Ending response", { response });
    return response;
};

async function createParticipant(contactId: string): Promise<CreateParticipantCommandOutput | undefined> {
    const command = new CreateParticipantCommand({
        InstanceId: instanceId,
        ContactId: contactId,
        ParticipantDetails: {
            ParticipantRole: "CUSTOM_BOT",
            DisplayName: "Chat Bot",
        },
    });

    try {
        const response = await connectClient.send(command);
        console.debug("Create Participant", { command, response });
        return response;
    } catch (error) {
        console.error("Create Participant", {
            command,
            error: (error as Error).message,
        });
    }

    return undefined;
}

async function startChatStreaming(contactId: string): Promise<string | undefined> {
    const command = new StartContactStreamingCommand({
        ChatStreamingConfiguration: {
            StreamingEndpointArn: chatStreamingTopicArn,
        },
        ContactId: contactId,
        InstanceId: instanceId,
    });

    try {
        const response = await connectClient.send(command);
        console.debug("Start Chat Streaming", { command, response });

        return response?.StreamingId;
    } catch (error) {
        console.error("Start Chat Streaming", {
            command,
            error: (error as Error).message,
        });
    }

    return undefined;
}

async function createParticipantConnection(
    token: string,
): Promise<CreateParticipantConnectionCommandOutput | undefined> {
    const command = new CreateParticipantConnectionCommand({
        Type: ["CONNECTION_CREDENTIALS"],
        ConnectParticipant: true,
        ParticipantToken: token,
    });

    try {
        const response = await connectParticipantClient.send(command);
        console.debug("Create Participant Connection", { command, response });

        return response;
    } catch (error) {
        console.error("Create Participant Connection", {
            command,
            error: (error as Error).message,
        });
    }

    return undefined;
}

async function saveChatContactDetails(contactId: string, connectionToken: string, streamingId: string): Promise<void> {
    const ttl = Math.floor(Date.now() / 1000) + (60 * 60); // 1 hour
    const command = new PutCommand({
        TableName: chatContactsTableName,
        Item: {
            contactId,
            connectionToken,
            streamingId,
            ttl,
        }
    });

    try {
        const response = await ddbDocClient.send(command);
        console.debug("Save contact details", { command, response });
    } catch (error) {
        console.error("Save contact details", {
            command,
            error: (error as Error).message,
        });
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
