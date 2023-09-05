import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import multer from "multer";
import {GridFsStorage} from "multer-gridfs-storage";
import path, { resolve } from "path";
import Grid from "gridfs-stream";
import methodOverride from "method-override";
import fs from "fs";

const PORT = (process.env.PORT || 3000 );

const app = express();

//middleware
app.use(methodOverride("_method"));
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

const mongoURL = process.env.MONGOURL;
console.log(mongoURL);

await mongoose.connect(mongoURL);
const conn = mongoose.connection;

// const conn = mongoose.connections[0].db;

// let gridBucket = new mongoose.mongo.GridFSBucket(conn, {
//     bucketName : "user"
// });


Grid.mongo = mongoose.mongo;

// //init gfs
 let gfs, gridfsBucket ;

conn.once("open" , () => {
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db , {
        bucketName : "use"
    });
    gfs = Grid(conn.db,mongoose.mongo);
    gfs.collection("use");
});


const storage = new GridFsStorage({ 
    db : conn,
    // file : (req,file) => {
    //     const fileName = "userfile";
    //     return {
    //         bucketName : "user",
    //         fileName : file.originalname
    //     }
    // }
    file : (req,file)=> {
        return new Promise((resolve , reject) => {
            const filename2 = file.originalname;
            const fileInfo = {
                aliases : filename2,
                bucketName : "use"
            };
        resolve(fileInfo);
        })
    }
});

const upload = multer({ storage });

const flySchema = new mongoose.Schema({
    username : String,
    password : String,
    name : String
});

const FlyUser = mongoose.model("flyuser", flySchema);


app.get("/", (req,res) => {
    //const data = user.find({});
    //console.log(data);
    res.render("index.ejs");
});

app.get("/user", (req,res) => {
    res.render("logister.ejs");
});


//route to get thr images

app.get("/images/:filename", async(req,res) => {
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db , {
        bucketName : "use"
    });
    let gfs = Grid(conn.db);
    gfs.collection("use");
    const img = await gfs.files.findOne({ filename : req.params.filename });
    //console.log(img);
    //console.log(img._id);
    if(!img) {
        return res.status(404).json({err: "image DNE"});
    } else {
        const readStream = gridfsBucket.openDownloadStream(img._id);
        readStream.pipe(res);
    }
});

app.get("/dashboard", async(req,res) => {
    
    gfs = Grid(conn.db);
    gfs.collection("use");
    const files = await gfs.files.find().toArray();
    //res.status(200).json({files});
    console.log(files);
    // const results = await getResults();
    // console.log(results);

    // let files = gridBucket.find({ filename : "d892cbf51757574b5d90986dc98311cb" }).toArray((err,result) => {
    //     if(err) {
    //         res.send(err);
    //     } else {
    //         gridBucket.openDownloadStreamByName("d892cbf51757574b5d90986dc98311cb").pipe(fs.createWriteStream('./outputFile'));
    //     }
    // });

    if(!files  || files.length === 0) {
        res.render("user.ejs", {files : false});
    } else {
        files.map(file => {
            if(file.contentType === "image/jpeg" || file.contentType === "image/png") {
                file.isImage = true;
            } else {
                file.isImage = false;
            }
                
        });
        res.render("user.ejs",{files : files});
    }

    //console.log(files);
    //res.render("user.ejs")
});

app.post("/upload",upload.single('file'), (req,res) => {
    console.log(req.file);
    res.redirect("/dashboard");
    console.log("upload sucessful");
});

app.delete("/files/:id" ,async (req,res) => {
    gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db , {
        bucketName : "use"
    });
    let gfs = Grid(conn.db);
    gfs.collection("use");
    console.log(req.params.id);
    try {
        await gridfsBucket.delete(new mongoose.Types.ObjectId(req.params.id));
        res.redirect("/dashboard");
    } catch(err) {
        console.log(err);
    }
    
});

app.listen(PORT, function() {
    console.log(`Server started on port ${PORT}`);
  });