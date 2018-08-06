import express from 'express';
import { post } from 'superagent';
import { config } from 'dotenv';
import v4 from 'uuid/v4';

config();
const app = express();

app.get('/oauth/state', (_, res) => {
    res.send(v4());
});

app.get('/oauth/redirect', async (req) => {
    console.log('got authorization token:', req.query.code);
    const monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
    const response = await post(monzoAuthUrl)
        .send({
            grant_type: 'authorization_code',
            client_id: process.env.MONZO_CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uri: process.env.REDIRECT_URI,
            code: req.query.code,
        })
        .type('form');
    console.log('got access token', response.body.access_token, 'got refresh token', response.body.refresh_token);
});

app.listen(3000, () => console.log('Daily Dosh server running'));
