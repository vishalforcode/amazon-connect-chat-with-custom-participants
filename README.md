## Amazon Connect Chat With Custom Participants

## Useful commands

* `cdk bookstrap`       preps default AWS account/region for CDK deployments
* `cdk deploy --parameters instanceArn=<instanceArn>`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template

* `npm install @tsconfig/node20 --save-dev`  
* `cdk deploy --parameters instanceArn=arn:aws:connect:ap-southeast-2:762233731859:instance/e0393aa3-2dbb-434e-b8ee-364f3db611e7 --parameters targetAgentArn=arn:aws:connect:ap-southeast-2:762233731859:instance/e0393aa3-2dbb-434e-b8ee-364f3db611e7/contact-flow/bc746acc-1746-439d-aa1c-d1a42dc96365 --force`


## SAML With AWS CONNECT

    1. Create OKTA Developer Account
    2. Go to Applications -> Create App Integration
    3. Select SAML2.0
    4. Fill out respective Values

| Key                        | Value                                                                                                                                             |
|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|
| Single Sign On URL         | https://signin.aws.amazon.com/saml                                                                                                                |
| Recipient URL              | https://signin.aws.amazon.com/saml                                                                                                                |
| Destination URL            | https://signin.aws.amazon.com/saml                                                                                                                |
| Audience Restriction       | https://signin.aws.amazon.com/saml                                                                                                                |
| Default Relay State        | https://ap-southeast-2.console.aws.amazon.com/connect/federate/62cd8991-86c5-4a03-bda9-429396393896?destination=https%3A%2F%2Fsysmog.com%2Fagent  |
| Name ID Format             | EmailAddress                                                                                                                                      |
| Response                   | Signed                                                                                                                                            |
| Assertion Signature        | Signed                                                                                                                                            |
| Signature Algorithm        | SHA256                                                                                                                                            |
| Digest Algorithm           | SHA256                                                                                                                                            |
| Assertion Encryption       | Unencrypted                                                                                                                                       |
| SAML Single Logout         | Disabled                                                                                                                                          |
| SAML Signed Request        | Disabled                                                                                                                                          |
| authnContextClassRef       | PasswordProtectedTransport                                                                                                                        |
| Honor Force Authentication | Yes                                                                                                                                               |
| Assertion Inline Hook      | None (disabled)                                                                                                                                   |
| SAML Issuer ID             | http://www.okta.com/${org.externalKey}                                                                                                            |



| Name                                                                 | Name Format   | Value                                                                                         |
|----------------------------------------------------------------------|---------------|-----------------------------------------------------------------------------------------------|
| https://aws.amazon.com/SAML/Attributes/RoleSessionName               | Unspecified   | user.email                                                                                    |
| https://aws.amazon.com/SAML/Attributes/Role                          | Unspecified   | arn:aws:iam::762233731859:saml-provider/OKTA,arn:aws:iam::762233731859:role/Sysmog-Agent-OKTA |
| https://aws.amazon.com/SAML/Attributes/SessionDuration               | Unspecified   | 43200                                                                                         |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress   | Unspecified   | user.email                                                                                    |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname      | Unspecified   | user.firstName                                                                                |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name           | Unspecified   | user.firstName                                                                                |
| http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname        | Unspecified   | user.lastName                                                                                 |

      5. Go to Customizations -> Other -> iframe embedding
      6. Value of Role is samlProviderArn, samlRoleArn
      7. Value of Relay State is https://<region>.console.aws.amazon.com/connect/federate/<connect-instance-id>?destination=https%3A%2F%2Fsysmog.com%2Fagent
      8. Add Approved Domains to Connect -> ConnectInstance - > Approved Domains