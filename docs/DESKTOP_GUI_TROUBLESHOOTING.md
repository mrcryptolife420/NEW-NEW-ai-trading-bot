# Desktop GUI Troubleshooting

Use `npm run desktop:dist:fresh` when `desktop/dist/win-unpacked/resources/app.asar` is locked by a running Electron process.

Startup logs are written to:

```text
%APPDATA%\Codex AI Trading Bot\logs\desktop-main.log
```

The desktop tray menu can open logs and the active `.env`. If the dashboard server fails, the app shows a diagnostic error page instead of a white screen.
