import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.DYNAMO_TABLE;
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/**
 * A user record is keyed by an unguessable `storageKey` (uuid) which the
 * browser holds in local storage. That key is the only credential the
 * frontend ever sees - the Monzo tokens never leave the backend.
 *
 * Shape:
 * {
 *   id, refreshToken, accessToken, accessTokenExpiry (epoch seconds),
 *   accountId, employerName,
 *   period: { paydayDate, nextPaydayDate, daysInPeriod, disposablePot },
 *   ignoredTransactionIds: string[],
 *   dismissedPaydayIds: string[],
 *   recurring: [{ sourceId, name, amount, day }],
 *     // monthly bills marked from a transaction: the source transaction id,
 *     // its display name, observed amount (negative pence) and day-of-month
 *   lastKnown: { safeToSpend, date }   // last ready-state position, for rollover
 * }
 */

export async function getUser(id) {
  const res = await doc.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return res.Item ?? null;
}

export async function saveUser(user) {
  await doc.send(new PutCommand({ TableName: TABLE, Item: user }));
  return user;
}
