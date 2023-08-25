require("dotenv").config();
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const File = require("./models/File");
const saltRounds = 10;
const { cloudinary } = require('./utils/cloudenary')
const fs = require("fs");

const app = express();
app.use(express.static(__dirname + '/public'));
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.DATABASE_URI);

const upload = multer({ dest: "uploads/" });

app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.render("index");
});

app.post("/upload", upload.single("file"), async (req, res) => {
    const fileData = {
        path: req.file.path,
        originalName: req.file.originalname
    }
    const ext = fileData.originalName.split(".")[1];
    console.log(ext);
    let path = fileData.path;
    if (req.file.mimetype === 'image/png') {
        const result = await cloudinary.uploader.upload(path, {});
        fileData.assetId = result.asset_id
    } else {
        path = path + "." + ext;
        fs.renameSync(fileData.path, path);
        const result = await cloudinary.uploader.upload(path, { folder: '', resource_type: 'raw' });
        fileData.assetId = result.asset_id
    }

    if (req.body.password != null && req.body.password != "") {
        fileData.password = await bcrypt.hash(req.body.password, saltRounds);
    }
    const file = await File.create(fileData);
    res.render("index", { fileLink: `${req.headers.origin}/file/${file.id}` })
});

app.get("/file/:id", async (req, res) => {
    const file = await File.findById(req.params.id);
    if (file.password != null) {
        res.render("password");
        return;
    }
    await downloadFile(file, res);
});

app.post("/file/:id", async (req, res) => {
    const file = await File.findById(req.params.id);
    const result = await bcrypt.compare(req.body.password, file.password);
    if (result === true) {
        await downloadFile(file, res);
        return;
    } else {
        res.render("password", { error: true });
        return;
    }
});

app.listen(process.env.PORT, () => {
    console.log(`Server started on port ${process.env.PORT}`);
});

async function downloadFile(file, res) {
    file.downloadCount = file.downloadCount + 1;
    await file.save();
    cloudinary.api
        .resource_by_asset_id([file.assetId])
        .then(result => {
            let url = result.secure_url;
            const uploadIndex = url.indexOf("upload");
            let temp = "fl_attachment" + url.slice(uploadIndex + 6);
            url = url.slice(0, uploadIndex) + "upload/" + temp;
            res.redirect(url);
        })
}