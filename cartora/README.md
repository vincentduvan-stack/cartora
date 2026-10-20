# Cartora

Editor de menús con una carta pública por restaurante.

## Editor con Flask

El modo completo procesa las plantillas, permite iniciar sesión y guarda la carta en la base de datos.

Desde esta carpeta, instala las dependencias:

```powershell
pip install -r uploads\requirements.txt
```

Después ejecuta `powershell -ExecutionPolicy Bypass -File .\iniciar_cartora.ps1` en PowerShell y crea una contraseña de al menos 12 caracteres cuando se solicite. También puedes iniciar la tarea **Cartora: iniciar editor** desde **Terminal > Run Task** en VS Code, con la carpeta del proyecto abierta.

Deja la terminal del servidor abierta y visita `http://127.0.0.1:5000/login`. Si el puerto está ocupado, cierra Live Server o establece `CARTORA_PORT` a otro puerto antes de iniciar el servidor. El editor y el guardado requieren sesión; las cartas en `/m/<slug>` siguen siendo públicas.

## Vista local con Live Server

Para revisar la apariencia sin configurar Flask, abre `templates\index.html` con Live Server. El editor carga una carta vacía y guarda el borrador únicamente en el almacenamiento local de ese navegador. Esta vista no inicia sesión, no publica la carta y no sincroniza con la base de datos. Usa el modo con Flask para esas funciones.

## Despliegue

Configura `CARTORA_ADMIN_PASSWORD` y una `CARTORA_SECRET_KEY` larga, aleatoria y persistente en el entorno del servidor. No guardes esos valores en el código ni en el repositorio. Para generar una clave de sesión, ejecuta:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Con HTTPS, configura también `CARTORA_COOKIE_SECURE=1`. La depuración permanece desactivada por defecto; solo actívala localmente con `FLASK_DEBUG=1`.
