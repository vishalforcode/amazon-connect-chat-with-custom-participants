import { Stack, StackProps, Duration, CfnParameter, ArnFormat, RemovalPolicy } from "aws-cdk-lib";
import { CfnContactFlow } from "aws-cdk-lib/aws-connect";
import { Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { PolicyStatement, Effect, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import contactFlowSource from "./custom-chat-bot.json";
import { NagSuppressions } from "cdk-nag";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { SubscriptionFilter, Topic } from "aws-cdk-lib/aws-sns";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";

export class AmazonConnectCustomBotStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const instanceArn = new CfnParameter(this, "instanceArn", {
            type: "String",
            description: "The Amazon Connect instance ARN to associate the stack with.",
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

        const bedrockBot = new NodejsFunction(this, "bedrockBot", {
            entry: "functions/bedrockBot/index.ts",
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
            },
        });

        // Subscriptions
        chatStreamingTopic.addSubscription(new LambdaSubscription(bedrockBot, {
            filterPolicy: {
                ParticipantRole: SubscriptionFilter.stringFilter({
                    allowlist: ['CUSTOMER'],
                }),
                Type: SubscriptionFilter.stringFilter({
                    allowlist: ['MESSAGE'],
                }),
            }
        }));

        // Permissions
        const connectServicePrincipal = new ServicePrincipal("connect.amazonaws.com").withConditions({
            ArnLike: { "aws:SourceArn": instanceArn },
        });
        chatContactsTable.grantReadWriteData(startBot);
        chatContactsTable.grantReadData(bedrockBot);

        startBot.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                resources: [`${instanceArn}/contact/*`],
                actions: ["connect:CreateParticipant", "connect:StartContactStreaming"],
            }),
        );

        startBot.grantInvoke(connectServicePrincipal);

        bedrockBot.addToRolePolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                resources: [`*`],
                actions: ["bedrock:InvokeModel", "connect:StopContactStreaming"],
            }),
        );

        // Add Contact Flow
        contactFlowSource.Actions[8].Parameters.LambdaFunctionARN = startBot.functionArn;

        const contactFlow = new CfnContactFlow(this, "contactFlow", {
            content: JSON.stringify(contactFlowSource),
            instanceArn,
            name: "Custom Bot Example",
            type: "CONTACT_FLOW",
            description: "Contact Flow to demonstrate using custom bot integration",
        });

        // cdk-nag suppressions
        NagSuppressions.addStackSuppressions(this, [
            { id: "AwsSolutions-IAM4", reason: "Use of managed policies accepted for demonstration resource and will be removed with CDK" },
            { id: "AwsSolutions-IAM5", reason: "Wildcard required for Amazon Connect contacts at runtime" },
            { id: "AwsSolutions-SNS2", reason: "Add this later" },
            { id: "AwsSolutions-SNS3", reason: "Add this later" }
        ]);
    }
}
