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
    res.setHeader('Access-Control-Allow-Origin', '*');
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
        const params = {
            Bucket: s3BucketName,
            Key: storageKey,
            Body: response.body.refresh_token,
        };
        s3.putObject(params, (err) => {
            if (err) {
                console.error('Error saving details', err);
                res.status(500).send('Error saving details');
            } else {
                res.send({ access_token: response.body.access_token, storage_key: storageKey });
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
            Key: req.query.storage_key,
        };
        refreshToken = await s3.getObject(params).promise();
    } catch (e) {
        console.error('Error retrieving refresh token from s3', e);
        res.status(500).send('Error retrieving refresh token from s3');
    }
    if (typeof refreshToken === 'undefined' || typeof refreshToken.Body === 'undefined') {
        throw new Error('something is undefined' + refreshToken);
    }
    try {
        const monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
        const refreshParams = {
            grant_type: 'refresh_token',
            client_id: process.env.MONZO_CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            refresh_token: refreshToken.Body.toString(),
        };
        const response = await post(monzoAuthUrl)
            .type('form')
            .send(refreshParams);
        const storageParams = {
            Bucket: s3BucketName,
            Key: req.query.storage_key,
            Body: response.body.refresh_token,
        };
        s3.putObject(storageParams, (err) => {
            if (err) {
                console.error('Error saving details', err);
                res.status(500).send('Error saving details');
            } else {
                res.send({ access_token: response.body.access_token });
            }
        });
    } catch (e) {
        res.status(500).send('Error refreshing access: ' + e);
    }
});

if (typeof process.env.DEVELOP !== 'undefined') {
    app.listen(3000, () => console.log('Daily Dosh server running'));
}

module.exports = app;
