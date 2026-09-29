# Matthew Browser on Render

This is a password-protected browser-in-a-page based on Mercury Workshop's Scramjet-App (AGPL-3.0). It serves the frontend and a private WISP relay from the same Render service. The original project is https://github.com/MercuryWorkshop/Scramjet-App.

1. Put this project in a Git repository that Render can access.
2. Create a Render web service using `render.yaml` or configure it as a Node web service with build command `npm ci --omit=dev` and start command `npm start`.
3. Set `BROWSER_PASSWORD` to a unique password of at least 12 characters. Do not commit it to the repository.
4. Open the Render `onrender.com` URL, enter the password, and test a simple site such as `https://example.com` before testing other sites.

The free plan sleeps after 15 minutes without traffic and can take about one minute to wake. The host URL and its WebSocket endpoint must both be reachable from the device. Some websites may still fail in a proxied browser.

For local development, run `BROWSER_PASSWORD=your-long-password npm start`. The server listens on port 8080 by default.
