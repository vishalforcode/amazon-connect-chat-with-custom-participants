import axios, { AxiosError } from 'axios';

type HandlerEvent = {
    query?: string;
};

type APIResponse = {
    statusCode: number;
    body: string;
};

export const handler = async (event: HandlerEvent): Promise<APIResponse> => {
    const apiUrl: string = process.env.API_URL || '';

    if (!event.query) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                message: 'Missing query parameter',
            }),
        };
    }

    // Ensure demo_name and key are explicitly included in the payload
    const payload = {
        query: event.query,
        demo_name: 'sysmog',
        key: 'prakhar',
    };

    try {
        // Make the API request
        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
        });

        console.log("API Response",response.data)

        // Explicitly check if the status code is in the success range
        if (response.status >= 200 && response.status < 300) {
            return {
                statusCode: response.status,
                body: JSON.stringify(response.data),
            };
        }

        // Handle unexpected status codes
        return {
            statusCode: response.status,
            body: JSON.stringify({
                message: 'Unexpected response from API',
                details: response.data,
            }),
        };
    } catch (error) {
        console.error('Error:', error);

        // Handle known Axios errors
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;
            return {
                statusCode: axiosError.response?.status || 500,
                body: JSON.stringify({
                    message: 'Error from API',
                    details: axiosError.response?.data || axiosError.message,
                }),
            };
        }

        // Handle unexpected errors
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal server error',
                error: (error as Error).message,
            }),
        };
    }
};
