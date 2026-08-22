/**
 * Client-Side Image Optimizer and Thumbnail Generator.
 * Converts raw heavy camera/phone uploads (3MB - 12MB) into lightweight WebP thumbnails (~45KB - 90KB)
 * using HTML5 Canvas API before transmitting over the network to Supabase Storage.
 */

export interface OptimizeImageOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'image/webp' | 'image/jpeg';
}

/**
 * Optimizes an image File client-side for rapid web delivery.
 * @param file Original image File from input file selector or drag & drop.
 * @param options Dimensions and quality settings.
 * @returns Promise<File> Compressed and resized File ready for fast upload.
 */
export async function optimizeImageForUpload(
    file: File,
    options: OptimizeImageOptions = {}
): Promise<File> {
    const {
        maxWidth = 800,
        maxHeight = 800,
        quality = 0.82,
        format = 'image/webp'
    } = options;

    // Skip vector or non-image files
    if (file.type === 'image/svg+xml' || !file.type.startsWith('image/')) {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new window.Image();

            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Scale down keeping original aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(file); // Fallback to original file
                    return;
                }

                // High quality bicubic-like canvas rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve(file);
                            return;
                        }

                        const extension = format === 'image/webp' ? 'webp' : 'jpg';
                        const originalBaseName = file.name.replace(/\.[^/.]+$/, '');
                        const optimizedFile = new File(
                            [blob],
                            `${originalBaseName}.${extension}`,
                            {
                                type: format,
                                lastModified: Date.now()
                            }
                        );

                        console.log(
                            `⚡ [Image Optimizer] ${file.name} (${Math.round(file.size / 1024)} KB) -> ` +
                            `${optimizedFile.name} (${Math.round(optimizedFile.size / 1024)} KB) ` +
                            `[${width}x${height}px, ${(100 - (optimizedFile.size / file.size) * 100).toFixed(1)}% reducido]`
                        );

                        resolve(optimizedFile);
                    },
                    format,
                    quality
                );
            };

            img.onerror = () => {
                resolve(file);
            };

            img.src = e.target?.result as string;
        };

        reader.onerror = () => {
            resolve(file);
        };

        reader.readAsDataURL(file);
    });
}
