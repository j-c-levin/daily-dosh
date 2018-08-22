import express from 'express';
import { post } from 'superagent';
import { config } from 'dotenv';
import v4 from 'uuid/v4';
import * as bodyParser from 'body-parser';
import { S3 } from 'aws-sdk';
const s3 = new S3();
const s3BucketName = 'daily.dosh.jclevin';
config();
const app = express();

app.use(bodyParser.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:4200');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

app.get('/oauth/state', (_, res) => {
    res.send(v4());
});

app.post('/auth', async (req, res) => {
    const monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
    try {
        const response = await post(monzoAuthUrl)
            .type('form')
            .send({
                grant_type: 'authorization_code',
                client_id: process.env.MONZO_CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                redirect_uri: process.env.REDIRECT_URI,
                code: req.body.code,
            });
        const storageKey = v4();
        res.send({ access_token: response.body.access_token, storage_key: storageKey });
        const params = {
            Bucket: s3BucketName,
            Key: storageKey,
            Body: response.body.refresh_token,
        };
        s3.putObject(params, (err) => {
            if (err) {
                console.error('Error saving details', err);
            }
        });
    } catch (e) {
        res.status(500).send('Error retrieving authorization code: ' + e);
    }
});

app.get('/auth', async (req, res) => {
    let refreshToken;
    try {
        const params = {
            Bucket: s3BucketName,
            Key: req.params.storage_key,
        };
        refreshToken = await s3.getObject(params).promise();
    } catch (e) {
        console.error('Error retrieving refresh token from s3', e);
        res.sendStatus(500).send('Error retrieving refresh token from s3');
    }
    try {
        const monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
        const response = await post(monzoAuthUrl)
            .type('form')
            .send({
                grant_type: 'refresh_token',
                client_id: process.env.MONZO_CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                refresh_token: refreshToken,
            });
        res.send({ access_token: response.body.access_token });
    } catch (e) {
        res.status(500).send('Error refreshing access: ' + e);
    }
});

app.listen(3000, () => console.log('Daily Dosh server running'));
