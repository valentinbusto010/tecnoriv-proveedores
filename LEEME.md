# Proveedores Tecno Riv: cómo publicarla e instalarla

La base de datos (tablas `prov_*` en tecnoriv-bot) y la función de Claude (`proveedores-ia`) ya están creadas en Supabase.
Faltan estos 4 pasos, que hacés vos una sola vez.

## 1. Cargar la clave de Anthropic (para leer páginas y buscar ganadores)
1. Entrá a https://console.anthropic.com → **API Keys** → **Create Key**. Cargá un poco de saldo en **Billing** (con USD 5 alcanza para muchas búsquedas).
2. En Supabase, abrí el proyecto **tecnoriv-bot** → **Edge Functions** → **Secrets**.
3. Agregá un secreto con nombre `ANTHROPIC_API_KEY` y pegá la clave. Guardá.

## 2. Publicar la app en GitHub Pages
1. Creá una cuenta en https://github.com si no tenés.
2. Arriba a la derecha: **+** → **New repository**. Nombre: `tecnoriv-proveedores`. Dejalo **Public** (GitHub Pages gratis lo pide; el código no tiene secretos, tus datos quedan protegidos por el login). Tocá **Create repository**.
3. En el repositorio nuevo: **uploading an existing file** (o **Add file → Upload files**). Arrastrá **todo el contenido** de esta carpeta (los archivos y la carpeta `icons`). Tocá **Commit changes**.
4. Andá a **Settings → Pages**. En **Branch** elegí `main` y `/ (root)`, y tocá **Save**.
5. En 1 o 2 minutos aparece la dirección: `https://TU-USUARIO.github.io/tecnoriv-proveedores/`.

## 3. Avisarle a Supabase la dirección de la app
En Supabase → **Authentication** → **URL Configuration** → **Redirect URLs** → **Add URL**, pegá la dirección del paso 2.5. Así el link del mail de confirmación te devuelve a la app.

## 4. Crear tu cuenta e instalar
1. Abrí la dirección, tocá **Crear cuenta** y usá tu email de Gmail (es el único autorizado). Confirmá el mail que te llega y entrá.
2. Después de crear tu cuenta, conviene apagar los registros nuevos: Supabase → **Authentication** → **Sign In / Providers** → desactivá **Allow new users to sign up**. (Aunque alguien se registre, no ve nada; esto es por prolijidad.)
3. **Instalar en la compu (Chrome o Edge):** el ícono de instalar en la barra de direcciones, o menú ⋮ → **Instalar Proveedores**.
4. **Instalar en Android (Chrome):** menú ⋮ → **Agregar a la pantalla principal** → **Instalar**.
5. **Instalar en iPhone (Safari):** botón Compartir → **Agregar a inicio**.

## Para actualizar la app más adelante
Subí de nuevo los archivos cambiados al repositorio (Add file → Upload files). La app instalada toma la versión nueva la próxima vez que la abrís con internet.
