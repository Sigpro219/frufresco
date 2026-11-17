import { revalidateTag, revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const tag = searchParams.get('tag') || 'products';
        const path = searchParams.get('path') || '/';

        // Revalidate specific tags and paths
        (revalidateTag as any)(tag);
        (revalidateTag as any)('products');
        (revalidateTag as any)('web-categories');
        (revalidateTag as any)('settings');
        
        revalidatePath(path, 'page');
        revalidatePath('/', 'layout');
        revalidatePath('/products/[id]', 'page');
        revalidatePath('/b2b/register', 'page');

        return NextResponse.json({
            revalidated: true,
            tag,
            path,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        console.error('Revalidation error:', error);
        return NextResponse.json({
            revalidated: false,
            error: error?.message || 'Error executing revalidation'
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return POST(request);
}
