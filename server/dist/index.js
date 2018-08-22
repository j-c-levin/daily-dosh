"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var superagent_1 = require("superagent");
var dotenv_1 = require("dotenv");
var v4_1 = __importDefault(require("uuid/v4"));
var bodyParser = __importStar(require("body-parser"));
var aws_sdk_1 = require("aws-sdk");
var s3 = new aws_sdk_1.S3();
var s3BucketName = 'daily.dosh.jclevin';
dotenv_1.config();
var app = express_1.default();
app.use(bodyParser.json());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});
app.get('/oauth/state', function (_, res) {
    res.send(v4_1.default());
});
app.post('/auth', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var monzoAuthUrl, response_1, storageKey_1, params, e_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, superagent_1.post(monzoAuthUrl)
                        .type('form')
                        .send({
                        grant_type: 'authorization_code',
                        client_id: process.env.MONZO_CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        redirect_uri: process.env.REDIRECT_URI,
                        code: req.body.code,
                    })];
            case 2:
                response_1 = _a.sent();
                storageKey_1 = v4_1.default();
                params = {
                    Bucket: s3BucketName,
                    Key: storageKey_1,
                    Body: response_1.body.refresh_token,
                };
                s3.putObject(params, function (err) {
                    if (err) {
                        console.error('Error saving details', err);
                        res.status(500).send('Error saving details');
                    }
                    else {
                        res.send({ access_token: response_1.body.access_token, storage_key: storageKey_1 });
                    }
                });
                return [3 /*break*/, 4];
            case 3:
                e_1 = _a.sent();
                res.status(500).send('Error retrieving authorization code: ' + e_1);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
app.get('/auth', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
    var refreshToken, params, e_2, monzoAuthUrl, refreshParams, response_2, storageParams, e_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                params = {
                    Bucket: s3BucketName,
                    Key: req.query.storage_key,
                };
                return [4 /*yield*/, s3.getObject(params).promise()];
            case 1:
                refreshToken = _a.sent();
                return [3 /*break*/, 3];
            case 2:
                e_2 = _a.sent();
                console.error('Error retrieving refresh token from s3', e_2);
                res.status(500).send('Error retrieving refresh token from s3');
                return [3 /*break*/, 3];
            case 3:
                if (typeof refreshToken === 'undefined' || typeof refreshToken.Body === 'undefined') {
                    throw new Error('something is undefined' + refreshToken);
                }
                _a.label = 4;
            case 4:
                _a.trys.push([4, 6, , 7]);
                monzoAuthUrl = 'https://api.monzo.com/oauth2/token';
                refreshParams = {
                    grant_type: 'refresh_token',
                    client_id: process.env.MONZO_CLIENT_ID,
                    client_secret: process.env.CLIENT_SECRET,
                    refresh_token: refreshToken.Body.toString(),
                };
                return [4 /*yield*/, superagent_1.post(monzoAuthUrl)
                        .type('form')
                        .send(refreshParams)];
            case 5:
                response_2 = _a.sent();
                storageParams = {
                    Bucket: s3BucketName,
                    Key: req.query.storage_key,
                    Body: response_2.body.refresh_token,
                };
                s3.putObject(storageParams, function (err) {
                    if (err) {
                        console.error('Error saving details', err);
                        res.status(500).send('Error saving details');
                    }
                    else {
                        res.send({ access_token: response_2.body.access_token });
                    }
                });
                return [3 /*break*/, 7];
            case 6:
                e_3 = _a.sent();
                res.status(500).send('Error refreshing access: ' + e_3);
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
if (typeof process.env.DEVELOP !== 'undefined') {
    app.listen(3000, function () { return console.log('Daily Dosh server running'); });
}
module.exports = app;
