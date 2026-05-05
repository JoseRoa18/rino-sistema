import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplicar middleware a todas las rutas excepto:
     *   - _next/static (assets)
     *   - _next/image (optimización de imágenes)
     *   - favicon.ico
     *   - archivos estáticos (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
