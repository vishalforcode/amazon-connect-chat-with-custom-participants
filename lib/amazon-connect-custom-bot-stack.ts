import { Stack, StackProps, Duration, CfnParameter, ArnFormat, RemovalPolicy, Fn } from "aws-cdk-lib";
import { CfnContactFlow, CfnQueue, CfnHoursOfOperation } from "aws-cdk-lib/aws-connect";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { PolicyStatement, Effect, ServicePrincipal, PolicyDocument,SamlProvider, SamlMetadataDocument, Role, SamlPrincipal, SamlConsolePrincipal} from "aws-cdk-lib/aws-iam";
import contactFlowSource from "./custom-chat-bot.json";
import contactFlowAgentSource from "./custom_bot_agent.json";
import { NagSuppressions } from "cdk-nag";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { SubscriptionFilter, Topic } from "aws-cdk-lib/aws-sns";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { LambdaSubscription, SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as fs from 'fs';

export class AmazonConnectCustomBotStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const instanceArn = new CfnParameter(this, "instanceArn", {
            type: "String",
            description: "The Amazon Connect instance ARN to associate the stack with.",
        }).valueAsString;

        const targetAgentArn = new CfnParameter(this, "targetAgentArn", {
            type: "String",
            description: "The Amazon Connect Transfer To Agent FLow",
        }).valueAsString;

        const instanceId = this.splitArn(instanceArn, ArnFormat.SLASH_RESOURCE_NAME).resourceName ?? "UNKNOWN";

        // Tables
        const chatContactsTable = new Table(this, "chat-contacts", {
            partitionKey: {
                name: "contactId",
                type: AttributeType.STRING,
            },
            timeToLiveAttribute: 'ttl',
            billingMode: BillingMode.PAY_PER_REQUEST,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        // Streams
        const chatStreamingTopic = new Topic(this, "chatStreaming", {
        });

        // Create the Dead Letter Queue
        // const dlq = new Queue(this, 'DeadLetterQueue', {
        //     queueName: 'DeadLetterQueue',
        // });

        // ChatQueue
        // const chatQueue = new Queue(this, 'ChatQueue', {
        //     queueName: 'ChatQueue',
        //     visibilityTimeout: Duration.seconds(30), // Optional: Adjust based on your needs
        //     deadLetterQueue: {
        //         queue: dlq, // Associate the DLQ
        //         maxReceiveCount: 3, // Number of delivery attempts before moving to DLQ
        //     },
        // });

        // Add a policy to enforce SSL usage
        // chatQueue.addToResourcePolicy(
        //     new PolicyStatement({
        //         effect: Effect.DENY,
        //         actions: ['sqs:*'], // Deny all SQS actions
        //         principals: [new AnyPrincipal()],
        //         conditions: {
        //             'Bool': {
        //                 'aws:SecureTransport': 'false', // Deny if the request is not using HTTPS
        //             },
        //         },
        //         resources: [chatQueue.queueArn],
        //     })
        // );

        // dlq.addToResourcePolicy(
        //     new PolicyStatement({
        //         effect: Effect.DENY,
        //         actions: ['sqs:*'], // Deny all SQS actions
        //         principals: [new AnyPrincipal()],
        //         conditions: {
        //             'Bool': {
        //                 'aws:SecureTransport': 'false', // Deny if the request is not using HTTPS
        //             },
        //         },
        //         resources: [chatQueue.queueArn],
        //     })
        // );




        // Lambdas
        const startBot = new NodejsFunction(this, "startBot", {
            entry: "functions/startBot/index.ts",
            runtime: Runtime.NODEJS_20_X,
            bundling: {
                minify: false, // minify code, defaults to false
                sourceMap: true, // include source map, defaults to false
                target: "node20",
                externalModules: [],
                mainFields: ['module', 'main']
            },
            timeout: Duration.seconds(15),
            tracing: Tracing.PASS_THROUGH,
            environment: {
                NODE_OPTIONS: "--enable-source-maps",
                INSTANCE_ID: instanceId,
                CHAT_CONTACTS_TABLE_NAME: chatContactsTable.tableName,
                CHAT_STREAMING_TOPIC_ARN: chatStreamingTopic.topicArn,
            },
        });

        const proxyBot = new NodejsFunction(this, "proxyBot", {
            entry: "functions/proxyBot/index.ts",
            runtime: Runtime.NODEJS_20_X,
            bundling: {
                minify: true, // minify code, defaults to false
                sourceMap: true, // include source map, defaults to false
                target: "node20",
                externalModules: [],
            },
            timeout: Duration.minutes(15),
            tracing: Tracing.PASS_THROUGH,
            environment: {
                NODE_OPTIONS: "--enable-source-maps",
                INSTANCE_ID: instanceId,
                API_URL: "https://search-api-655783359579.us-central1.run.app/api/search",
                API_KEY: "1234"
            },
        });

        const chatBot = new NodejsFunction(this, "chatBot", {
            entry: "functions/chatBot/index.ts",
            runtime: Runtime.NODEJS_20_X,
            bundling: {
                minify: true, // minify code, defaults to false
                sourceMap: true, // include source map, defaults to false
                target: "node20",
                externalModules: [],
            },
            timeout: Duration.minutes(15),
            tracing: Tracing.PASS_THROUGH,
            environment: {
                NODE_OPTIONS: "--enable-source-maps",
                INSTANCE_ID: instanceId,
                CHAT_CONTACTS_TABLE_NAME: chatContactsTable.tableName,
                PROXY_BOT_ARN: proxyBot.functionArn
            },
        });



        // Subscriptions

        // Subscribe the chatbot to the SNS topic
        chatStreamingTopic.addSubscription(new LambdaSubscription(chatBot, {
            filterPolicy: {
                ParticipantRole: SubscriptionFilter.stringFilter({
                    allowlist: ['CUSTOMER'],
                }),
                Type: SubscriptionFilter.stringFilter({
                    allowlist: ['MESSAGE'],
                }),
            }
        }));

        // Subscribe the SQS queue to the SNS topic
        // chatStreamingTopic.addSubscription(
        //     new SqsSubscription(chatQueue, {
        //         filterPolicy: {
        //             ParticipantRole: SubscriptionFilter.stringFilter({
        //                 allowlist: ['CUSTOMER'],
        //             }),
        //             Type: SubscriptionFilter.stringFilter({
        //                 allowlist: ['MESSAGE'],
        //             }),
        //         },
        //     }),
        // );


        // Set the SQS queue as an event source for the Lambda function
        // chatBot.addEventSource(new SqsEventSource(chatQueue));


        // Permissions
        const connectServicePrincipal = new ServicePrincipal("connect.amazonaws.com").withConditions({
            ArnLike: { "aws:SourceArn": instanceArn },
        });
        chatContactsTable.grantReadWriteData(startBot);
        chatContactsTable.grantReadData(chatBot);

        startBot.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                resources: [`${instanceArn}/contact/*`],
                actions: ["connect:CreateParticipant", "connect:StartContactStreaming"],
            }),
        );

        startBot.grantInvoke(connectServicePrincipal);

        chatBot.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                resources: [`*`],
                actions: ["bedrock:InvokeModel", "connect:StopContactStreaming", "lambda:InvokeFunction", "connect:TransferContact", "connect:StartChatContact"],
            }),
        );

        // Grant the Lambda function permissions to read from the SQS queue
        // chatQueue.grantConsumeMessages(chatBot);


        // Add Contact Flow
        // contactFlowSource.Actions[8].Parameters.LambdaFunctionARN = startBot.functionArn;
        // const lambdaIndexes = contactFlowAgentSource.Actions
        //     .map((action: any, index: number) => {
        //         if (action.Parameters && action.Parameters.LambdaFunctionARN) {
        //             return index; // Return index if LambdaFunctionARN exists
        //         }
        //         return -1; // Return -1 if LambdaFunctionARN doesn't exist
        //     })
        //     .filter(index => index !== -1); // Filter out -1s to get valid indexes

        // console.log(lambdaIndexes);
        contactFlowAgentSource.Actions[2].Parameters.LambdaFunctionARN = startBot.functionArn;
        contactFlowAgentSource.Actions[9].Parameters.ContactFlowId = targetAgentArn??'';

        const contactFlow = new CfnContactFlow(this, "contactFlow", {
            content: JSON.stringify(contactFlowAgentSource),
            instanceArn,
            name: "SysMog Bot - Prod",
            type: "CONTACT_FLOW",
            description: "Sysmog Search",
        });

        // const hoursOfOperation = new CfnHoursOfOperation(this, 'ConnectHoursOfOperation', {
        //     instanceArn: instanceArn,
        //     name: '24x7Hours',
        //     timeZone: 'Asia/Kolkata',
        //     config: [
        //         { day: 'MONDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'TUESDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'WEDNESDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'THURSDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'FRIDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'SATURDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //         { day: 'SUNDAY', startTime: { hours: 0, minutes: 0 }, endTime: { hours: 23, minutes: 59 } },
        //     ],
        // });

        // // Create the Queue using the dynamically created HoursOfOperation ARN
        // const connectQueue = new CfnQueue(this, 'ConnectQueue', {
        //     instanceArn: instanceArn,
        //     name: 'SupportQueue',
        //     description: 'Queue for customer support',
        //     hoursOfOperationArn: hoursOfOperation.attrHoursOfOperationArn
        // });

        chatBot.addEnvironment("CONTACT_FLOW_ARN", contactFlow.attrContactFlowArn)
        // chatBot.addEnvironment("QUEUE_ARN", connectQueue.attrQueueArn)

        // Add SAML Provider & Add Policy

        // Read the SAML metadata XML file (replace with the path to your metadata file)
        const samlMetadata = fs.readFileSync('./lib/OKTA.xml', 'utf8');

        // Create the SAML identity provider
        const samlIdp = new SamlProvider(this, 'SamlProvider', {
            metadataDocument: SamlMetadataDocument.fromXml(samlMetadata),
            name : "SysMog-SAML-Provider",
        });

        // Create an IAM role that trusts the SAML provider for console access
        const samlFederationRolePrincipal = new SamlConsolePrincipal(samlIdp, {
            StringEquals: { 'SAML:aud': 'https://signin.aws.amazon.com/saml' },
        }).withSessionTags();

        // Add an inline policy to the role
        const policyJson = fs.readFileSync('./lib/ccp-access-policy.json', 'utf8');
        const policyDocument = PolicyDocument.fromJson(JSON.parse(policyJson));

        // Create the IAM role with the SAML principal
        // Create the IAM role with the SAML principal
        const samlFederationRole = new Role(this, 'SamlFederationRole', {
            assumedBy: samlFederationRolePrincipal,
            inlinePolicies: {
                CCPAccessPolicy: policyDocument,
            },
            roleName : "SysMog-SAML-Provider-Role",
        });

        // role.attachInlinePolicy(new Policy(this, 'CCPAccessInlinePolicy', {
        //     statements: [
        //         new PolicyStatement({
        //             actions: ['s3:ListBucket', 's3:GetObject'], // Add the actions you want to allow
        //             resources: [
        //                 'arn:aws:s3:::your-bucket-name', // Bucket ARN
        //                 'arn:aws:s3:::your-bucket-name/*' // Objects inside the bucket
        //             ],
        //         }),
        //         new PolicyStatement({
        //             actions: ['ec2:DescribeInstances'], // Another action you can add
        //             resources: ['*'], // Apply to all EC2 instances
        //         }),
        //     ],
        // }));



        // cdk-nag suppressions
        NagSuppressions.addStackSuppressions(this, [
            { id: "AwsSolutions-IAM4", reason: "Use of managed policies accepted for demonstration resource and will be removed with CDK" },
            { id: "AwsSolutions-IAM5", reason: "Wildcard required for Amazon Connect contacts at runtime" },
            { id: "AwsSolutions-SNS2", reason: "Add this later" },
            { id: "AwsSolutions-SNS3", reason: "Add this later" }
        ]);
    }
}
