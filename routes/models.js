const express = require('express');
const formidable = require('express-formidable');
const { listObjects, uploadObject, translateObject, getManifest, urnify } = require('../services/aps.js');
const APS = require('forge-apis'); // atau sesuai SDK yang Anda pakai

const BUCKET = process.env.APS_BUCKET;

let router = express.Router();

router.get('/api/models', async function (req, res, next) {
    try {
        const objects = await listObjects();
        res.json(objects.map(o => ({
            name: o.objectKey,
            urn: urnify(o.objectId)
        })));
    } catch (err) {
        next(err);
    }
});

router.get('/api/models/:urn/status', async function (req, res, next) {
    try {
        const manifest = await getManifest(req.params.urn);
        if (manifest) {
            let messages = [];
            if (manifest.derivatives) {
                for (const derivative of manifest.derivatives) {
                    messages = messages.concat(derivative.messages || []);
                    if (derivative.children) {
                        for (const child of derivative.children) {
                            messages.concat(child.messages || []);
                        }
                    }
                }
            }
            res.json({ status: manifest.status, progress: manifest.progress, messages });
        } else {
            res.json({ status: 'n/a' });
        }
    } catch (err) {
        next(err);
    }
});

router.post('/api/models', formidable({ maxFileSize: Infinity }), async function (req, res, next) {
    const file = req.files['model-file'];
    if (!file) {
        res.status(400).send('The required field ("model-file") is missing.');
        return;
    }
    try {
        const obj = await uploadObject(file.name, file.path);
        await translateObject(urnify(obj.objectId), req.fields['model-zip-entrypoint']);
        res.json({
            name: obj.objectKey,
            urn: urnify(obj.objectId)
        });
    } catch (err) {
        next(err);
    }
});

async function ensureBucketExists(oauthClient, credentials) {
    const bucketsApi = new APS.BucketsApi();
    const bucketKey = process.env.APS_BUCKET; // pastikan sudah di .env

    try {
        // Cek apakah bucket sudah ada
        await bucketsApi.getBucketDetails(bucketKey, oauthClient, credentials);
    } catch (err) {
        if (err.statusCode === 404) {
            // Jika belum ada, buat bucket
            await bucketsApi.createBucket({
                bucketKey: bucketKey,
                policyKey: 'transient' // atau 'persistent' sesuai kebutuhan
            }, {}, oauthClient, credentials);
        } else {
            throw err;
        }
    }
}

module.exports = router;
