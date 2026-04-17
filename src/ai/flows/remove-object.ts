
// Remove-object.ts
'use server';
/**
 * @fileOverview AI-powered object removal tool.
 *
 * - removeObject - A function that handles the object removal process.
 * - RemoveObjectInput - The input type for the removeObject function.
 * - RemoveObjectOutput - The return type for the removeObject function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RemoveObjectInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo with an object to remove, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  maskDataUri: z
    .string()
    .describe(
      "A mask of the object to remove, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type RemoveObjectInput = z.infer<typeof RemoveObjectInputSchema>;

const RemoveObjectOutputSchema = z.object({
  generatedImage: z
    .string()
    .describe("The image with the object removed, as a data URI."),
});
export type RemoveObjectOutput = z.infer<typeof RemoveObjectOutputSchema>;

export async function removeObject(input: RemoveObjectInput): Promise<RemoveObjectOutput> {
  return removeObjectFlow(input);
}

const removeObjectPrompt = ai.definePrompt({
  name: 'removeObjectPrompt',
  input: {schema: RemoveObjectInputSchema},
  output: {schema: RemoveObjectOutputSchema},
  prompt: [
    {
      media: {
        url: '{{{photoDataUri}}}',
      },
    },
    {
      media: {
        url: '{{{maskDataUri}}}',
      },
    },
    {
      text:
        'Remove the object in the first image, using the second image as a mask.' +
        'Return the resulting image as a data URI.',
    },
  ],
});

const removeObjectFlow = ai.defineFlow(
  {
    name: 'removeObjectFlow',
    inputSchema: RemoveObjectInputSchema,
    outputSchema: RemoveObjectOutputSchema,
  },
  async input => {
    const {media} = await ai.generate({
      model: 'googleai/gemini-2.0-flash-preview-image-generation',
      prompt: [
        { media: { url: input.photoDataUri } },
        { media: { url: input.maskDataUri } },
        { text: 'Remove the object in the first image, using the second image as a mask. Return the resulting image as a data URI.' },
      ],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    return {generatedImage: media!.url!};
  }
);
