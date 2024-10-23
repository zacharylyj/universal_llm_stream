import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
const defaultService = 'Azure'

export const handler = awslambda.streamifyResponse(
    async (event, responseStream, _context) => {
        if (!event.body) {
            console.log("No request body");
            return errorMessage("No request body detected", responseStream)

        }
        const body = JSON.parse(event.body); // Parse the body if present
        const {
            service = defaultService,
            deployment,
            params,
            systemPrompt,
            queryPrompt,
            history,
            callback
        } = body;
        if (service == 'Azure') {
            azurecall(deployment, params, systemPrompt, queryPrompt, history, callback, responseStream)
        }

    }
);

function errorMessage(error, responseStream) {
    console.log(error);
    responseStream.write(`Error: ${error}`);
    responseStream.end();
}

async function azurecall(deployment, params, systemPrompt, queryPrompt, history, callback, responseStream) {
    const endpoint = process.env.AZURE_ENDPOINT;
    const apiKey = process.env.AZURE_API_KEY;
    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));
    try {
        // Validate that deployment is provided
        if (!deployment) {
            deployment = "gpt4-Omni"
            console.log(`No deployment provided. Defaulting to ${deployment}`);
        }
        // Prepare messages by combining systemPrompt, history, and queryPrompt
        let messages = [];
        if (systemPrompt) {
            const systemMessage = { role: "system", content: systemPrompt };
            messages.push(systemMessage);
        } else {
            return errorMessage("System Prompt (systemPrompt) missing", responseStream)
        }
        if (history && Array.isArray(history)) {
            messages = [...messages, ...history];
        }
        if (queryPrompt) {
            const queryMessage = { role: "user", content: queryPrompt };
            messages.push(queryMessage);
        } else {
            return errorMessage("User Query (queryPrompt) missing", responseStream)
        }

        // Ensure that messages are valid
        if (!messages || messages.length === 0) {
            throw new Error("No valid messages provided.");
        }

        // Stream response from Azure OpenAI
        const completion = await client.streamChatCompletions(
            deployment, // string
            messages, // sting[]
            params // Optional parameters like top_p, temperature, etc.
        );

        let finalResponse = {
            history: messages, // Initialize with history and system prompts
            userMessage: queryPrompt, // Log the user's latest query
            assistantResponse: ""
        };

        // Stream the completion response
        for await (const event of completion) {
            for (const choice of event.choices) {
                if (choice.delta !== undefined && choice.delta.content !== undefined) {
                    let content = choice.delta.content;

                    // Stream out each character individually
                    for (let char of content) {
                        responseStream.write(char); // Stream each character
                        console.log(char);
                    }

                    // Append the content to the assistant's response
                    finalResponse.assistantResponse += content;
                }
            }
        }
        responseStream.end(); // Ensure to close the stream

        // Handle callback: return entire conversation history
        if (callback) {
            return
        }

    } catch (error) {
        console.error("Error occurred:", error);
        responseStream.end();
    }

}
