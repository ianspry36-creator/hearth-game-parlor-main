# Game Parlor

Create a game website.  The main screen should be icon menu list of the games of cribbage and backgammon, further games will be added in future.  After selecting a game the user will be able to play a computer opponent.  Each game will have a button which will bring up a dialog box to explain the rules of the game.  There will also be a human button which will allow you to select a human opponent from a waiting room.  Each opponent will need to be asked for a Nickname upon entering the waiting room.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://hearth-game-parlor.lovable.app

## Deploy to Render

Click the button below to deploy this app to [Render](https://render.com). It reads the service definition in [`render.yaml`](./render.yaml) and builds a standard Node.js server (via the `NITRO_PRESET=node-server` env var) instead of the default Cloudflare Workers output.

> ⚠️ **Before you deploy:** replace `YOUR_USERNAME` and `YOUR_REPO` in the link below with your real GitHub repository URL. The repository must be public for the one-click button to work.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/YOUR_USERNAME/YOUR_REPO)

During setup, Render will prompt you for the Supabase environment variables. They are marked `sync: false` in `render.yaml`, so they are never committed to the repository — copy the values from your local `.env` file:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/318c9de1-732f-431d-8414-d97152629aa4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
