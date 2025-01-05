## Amazon Connect Chat With Custom Participants

## Useful commands

* `cdk bookstrap`       preps default AWS account/region for CDK deployments
* `cdk deploy --parameters instanceArn=<instanceArn>`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

* `npm install @tsconfig/node20 --save-dev`  
* `cdk deploy --parameters instanceArn=arn:aws:connect:us-east-1:779846806113:instance/f5264e64-9fec-4e58-ae4a-4efdaaff3d76 --parameters targetAgentArn=arn:aws:connect:us-east-1:779846806113:instance/f5264e64-9fec-4e58-ae4a-4efdaaff3d76/contact-flow/fffada53-b59a-4c2f-808c-c9b41e7be9a7 --force`


## SAML With AWS CONNECT

    1. Create OKTA Developer Account
    2. Go to Applications -> Create App Integration
    3. Select SAML2.0
    4. Fill out respective Values

| Key                         | Value                                                                                                                                       |
|-----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------|
| Single Sign On URL          | https://signin.aws.amazon.com/saml                                                                                                          |
| Recipient URL               | https://signin.aws.amazon.com/saml                                                                                                          |
| Destination URL             | https://signin.aws.amazon.com/saml                                                                                                          |
| Audience URI (SP Entity ID) | https://signin.aws.amazon.com/saml                                                                                                          |
| Default Relay State         | https://us-east-1.console.aws.amazon.com/connect/federate/f5264e64-9fec-4e58-ae4a-4efdaaff3d76?destination=https%3A%2F%2Fsysmog.com%2Fagent |
| Application username        | Email                                                                                                                                       |
| Name ID Format              | EmailAddress                                                                                                                                |
| Response                    | Signed                                                                                                                                      |
| Assertion Signature         | Signed                                                                                                                                      |
| Signature Algorithm         | SHA256                                                                                                                                      |
| Digest Algorithm            | SHA256                                                                                                                                      |
| Assertion Encryption        | Unencrypted                                                                                                                                 |
| SAML Single Logout          | Disabled                                                                                                                                    |
| SAML Signed Request         | Disabled                                                                                                                                    |
| authnContextClassRef        | PasswordProtectedTransport                                                                                                                  |
| Honor Force Authentication  | Yes                                                                                                                                         |
| Assertion Inline Hook       | None (disabled)                                                                                                                             |
| SAML Issuer ID              | http://www.okta.com/${org.externalKey}                                                                                                      |



| Name                                                                 | Name Format   | Value                                                                                                                  |
|----------------------------------------------------------------------|---------------|------------------------------------------------------------------------------------------------------------------------|
| https://aws.amazon.com/SAML/Attributes/RoleSessionName               | Unspecified   | user.email                                                                                                             |
| https://aws.amazon.com/SAML/Attributes/Role                          | Unspecified   | arn:aws:iam::779846806113:saml-provider/SysMog-SAML-Provider,arn:aws:iam::779846806113:role/SysMog-SAML-Provider-Role  |
| https://aws.amazon.com/SAML/Attributes/SessionDuration               | Unspecified   | 43200                                                                                                                  |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress   | Unspecified   | user.email                                                                                                             |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname      | Unspecified   | user.firstName                                                                                                         |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name           | Unspecified   | user.firstName                                                                                                         |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname        | Unspecified   | user.lastName                                                                                                          |

      5. Go to Customizations -> Other -> iframe embedding
      6. Value of Role is samlProviderArn, samlRoleArn
      7. Value of Relay State is https://<region>.console.aws.amazon.com/connect/federate/<connect-instance-id>?destination=https%3A%2F%2Fsysmog.com%2Fagent
      8. Add Approved Domains to Connect -> ConnectInstance - > Approved Domains