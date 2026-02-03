import { 
    CognitoIdentityProviderClient, 
    SignUpCommand, 
    InitiateAuthCommand, 
    ConfirmSignUpCommand,
    AuthFlowType
} from "@aws-sdk/client-cognito-identity-provider";

export interface CognitoServiceConfig {
    client: CognitoIdentityProviderClient;
    clientId: string;
}

export class CognitoService {
    private client: CognitoIdentityProviderClient;
    private clientId: string;

    constructor(config: CognitoServiceConfig) {
        this.client = config.client;
        this.clientId = config.clientId;
    }

    async signup(identifier: string, password: string) {
        // We use identifier as both username and email (if it contains @)
        // For now, Cognito is configured to use EMAIL as the primary sign-in.
        const command = new SignUpCommand({
            ClientId: this.clientId,
            Username: `user_${crypto.randomUUID()}`,
            Password: password,
            UserAttributes: [
                { Name: "email", Value: identifier.includes("@") ? identifier : undefined },
                // phone_number would go here if detected
            ].filter(attr => attr.Value !== undefined) as any,
        });

        return await this.client.send(command);
    }

    async login(identifier: string, password: string) {
        const command = new InitiateAuthCommand({
            AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
            ClientId: this.clientId,
            AuthParameters: {
                USERNAME: identifier,
                PASSWORD: password,
            },
        });

        return await this.client.send(command);
    }

    async confirmSignup(identifier: string, code: string) {
        const command = new ConfirmSignUpCommand({
            ClientId: this.clientId,
            Username: identifier,
            ConfirmationCode: code,
        });

        return await this.client.send(command);
    }
}
