# Gloria & Jessica — RSVP de boda

Sitio estático mobile-first hecho con HTML, CSS y JavaScript sin frameworks. Los datos de invitados y las confirmaciones viven en Google Sheets y se consultan mediante Google Apps Script.

## Arquitectura

```text
QR individual
    ↓
GitHub Pages (?codigo=GJ001)
    ↓
Google Apps Script
    ↓
Google Sheets
```

El frontend solo envía el código recibido y obtiene la invitación correspondiente. No descarga la lista completa ni contiene una base de invitados.

Esta arquitectura evita publicar directamente la lista dentro del repositorio, pero **no es autenticación ni garantiza privacidad absoluta**. Los códigos son identificadores difíciles de adivinar; cualquier persona con una URL válida podrá consultar esa invitación. No guardes información sensible en la hoja.

## Archivos del proyecto

- `index.html`: estructura y contenido de la invitación.
- `styles.css`: diseño, responsive y animaciones.
- `script.js`: configuración, consulta individual, RSVP y `localStorage`.
- `assets/`: ornamentos visuales y futura imagen Open Graph.

El repositorio no contiene ninguna lista local de invitados.

## Preparar Google Sheets

Crea un archivo privado de Google Sheets con dos pestañas. No publiques la hoja en la web.

### Pestaña Invitados

Primera fila:

```text
Código | Invitado | Lugares | Estado | Asistentes | Fecha confirmación
```

Ejemplo genérico:

```text
GJ004 | Familia Ejemplo | 3 | Pendiente | | 
```

Para agregar una invitación:

1. Crea un código único y difícil de adivinar.
2. Escribe el nombre que aparecerá en la invitación.
3. Asigna el número de lugares.
4. Coloca `Pendiente` como estado inicial.

### Pestaña Respuestas

Primera fila:

```text
Fecha | Código | Invitado | Asistencia | Personas | Lugares permitidos | Mensaje | URL
```

`Invitados` representa el estado actual y `Respuestas` conserva el historial, incluyendo modificaciones.

## Configurar Google Apps Script

En Google Sheets abre **Extensiones → Apps Script** y utiliza este ejemplo. El servidor busca siempre nombre y lugares oficiales mediante el código; no confía en los valores enviados por el navegador.

```js
const INVITADOS_SHEET = "Invitados";
const RESPUESTAS_SHEET = "Respuestas";

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function findInvitation(code) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(INVITADOS_SHEET);
  if (!sheet) throw new Error("Falta la pestaña Invitados");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  const index = rows.findIndex(row => normalizeCode(row[0]) === code);
  if (index === -1) return null;

  return {
    row: index + 2,
    codigo: normalizeCode(rows[index][0]),
    invitado: String(rows[index][1]).trim(),
    lugares: Number(rows[index][2]),
    estado: String(rows[index][3] || "Pendiente")
  };
}

function doGet(e) {
  try {
    if (e.parameter.accion !== "invitado") {
      return jsonResponse({ ok: false, error: "ACCION_INVALIDA" });
    }

    const codigo = normalizeCode(e.parameter.codigo);
    const invitation = findInvitation(codigo);

    if (!invitation) {
      return jsonResponse({ ok: false, error: "INVITACION_NO_ENCONTRADA" });
    }

    return jsonResponse({
      ok: true,
      codigo: invitation.codigo,
      invitado: invitation.invitado,
      lugares: invitation.lugares,
      estado: invitation.estado
    });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "ERROR_INTERNO" });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);
    const data = JSON.parse(e.postData.contents || "{}");
    const codigo = normalizeCode(data.codigo);
    const invitation = findInvitation(codigo);

    if (!invitation) {
      return jsonResponse({ ok: false, error: "INVITACION_NO_ENCONTRADA" });
    }

    const asistencia = data.asistencia === "Sí" ? "Sí" : data.asistencia === "No" ? "No" : null;
    const personas = asistencia === "Sí" ? Number(data.numeroPersonas) : 0;

    if (!asistencia || !Number.isInteger(personas) || personas < 0 || personas > invitation.lugares || (asistencia === "Sí" && personas < 1)) {
      return jsonResponse({ ok: false, error: "DATOS_INVALIDOS" });
    }

    const mensaje = String(data.mensaje || "").trim().slice(0, 300);
    const fecha = new Date();
    const invitadosSheet = SpreadsheetApp.getActive().getSheetByName(INVITADOS_SHEET);
    const respuestasSheet = SpreadsheetApp.getActive().getSheetByName(RESPUESTAS_SHEET);
    if (!respuestasSheet) throw new Error("Falta la pestaña Respuestas");

    invitadosSheet.getRange(invitation.row, 4, 1, 3).setValues([[
      asistencia === "Sí" ? "Confirmado" : "No asistirá",
      personas,
      fecha
    ]]);

    respuestasSheet.appendRow([
      fecha,
      invitation.codigo,
      invitation.invitado,
      asistencia,
      personas,
      invitation.lugares,
      mensaje,
      String(data.urlInvitacion || "")
    ]);

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "ERROR_INTERNO" });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
```

Después:

1. Pulsa **Implementar → Nueva implementación**.
2. Selecciona **Aplicación web**.
3. Ejecuta como tu cuenta.
4. Permite el acceso a cualquier persona con el enlace.
5. Autoriza y copia la URL que termina en `/exec`.
6. Cuando cambies el código de Apps Script, implementa una nueva versión.

## Conectar el frontend

Al principio de `script.js` encontrarás:

```js
const WEDDING_CONFIG = Object.freeze({
  // ...
  googleScriptUrl: "PEGAR_AQUI_URL_APPS_SCRIPT",
  developmentMode: true
});
```

Pega la URL `/exec` en `googleScriptUrl`. No incluyas contraseñas, API keys ni credenciales.

La consulta individual será equivalente a:

```text
URL_APPS_SCRIPT?accion=invitado&codigo=GJ004
```

Si Apps Script no responde en 10 segundos, la interfaz distingue el error de conexión de un código inexistente y ofrece **Intentar de nuevo**.

## Modo de desarrollo

Con `developmentMode: true`, entrar sin `?codigo=` usa exclusivamente:

```text
TEST | Invitado de prueba | 4 lugares
```

Las confirmaciones de `TEST` se simulan y no se envían a Sheets. Con `developmentMode: false`, una visita sin código solicita acceder desde el QR.

Un código presente en la URL siempre se valida contra Apps Script, incluso si existe una respuesta en `localStorage`.

## Probar localmente

Usa un servidor local, por ejemplo:

```bash
npx serve .
```

Luego prueba:

- `http://localhost:3000/`: modo de desarrollo.
- `http://localhost:3000/?codigo=GJ004`: código existente en Sheets.
- `http://localhost:3000/?codigo=NOEXISTE`: invitación no encontrada.
- Desactiva temporalmente la red o usa una URL incorrecta para comprobar error y reintento.
- Responde Sí y No, prueba el límite de lugares, recarga y utiliza **Modificar mi respuesta**.

El puerto puede variar según el servidor. También puedes usar la extensión Live Server de VS Code.

## `localStorage`

Solo mejora la experiencia visual. Después de validar el código remotamente, puede mostrar “Ya registramos tu respuesta” y permitir modificarla. Google Sheets continúa siendo la fuente oficial y cada modificación agrega una fila al historial de `Respuestas`.

## URLs y códigos QR

La URL para el ejemplo genérico sería:

```text
https://usuario.github.io/boda/?codigo=GJ004
```

Genera un QR distinto para cada URL. Quien tenga la URL podrá consultar esa invitación, por lo que conviene usar códigos únicos no secuenciales antes de imprimir.

## Publicar en GitHub Pages

1. Sube los archivos a la rama `main` de GitHub.
2. Abre **Settings → Pages**.
3. Selecciona **Deploy from a branch**.
4. Elige `main`, carpeta `/ (root)` y guarda.
5. Espera la URL publicada y prueba un código real desde computadora y celular.

## Revisión antes de publicar

- Configura `googleScriptUrl` y prueba GET y POST reales.
- Cambia `developmentMode` a `false` si deseas exigir QR.
- Confirma que la hoja no esté publicada y que el repositorio no contenga listas de invitados.
- Prueba código válido, inválido, timeout, error de red, RSVP, límite de personas, `localStorage` y modificación.
- Agrega `assets/og-image.jpg` para la vista previa al compartir.
