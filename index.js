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
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import {Strategy as FacebookStrategy} from "passport-facebook";
import findOrCreate from "mongoose-findorcreate";

const saltRounds = 10;
const PORT = (process.env.PORT || 3000 );
const app = express();

//middlewares
app.use(methodOverride("_method"));
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
    secret: "user files on the fly.",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());


const mongoURL = process.env.MONGOURL;
console.log(mongoURL);

await mongoose.connect(mongoURL);
const conn = mongoose.connection;

//userschema
const flySchema = new mongoose.Schema({
    username : String,
    password : String,
    name : String,
    googleId : String,
    facebookId : String,
    imgurl : String
});

flySchema.plugin(findOrCreate);

const FlyUser = mongoose.model("flyuser", flySchema);


//localstrategy
passport.use(new LocalStrategy(
    async function(username, password, done) {
    try{
        const user = await FlyUser.findOne({ username: username });
        if (!user) { 
            console.log("no users"); 
            return done(null, false);
        }
        const match = await bcrypt.compare(password, user.password);
        if(!match) {
            return done(null, false);
        } else {
            return done(null, user);
        }
        // if (!user.verifyPassword(password)) { return done(null, false); }
        //     return done(null, user);
    } catch(err) {
        console.log(err);
        return done(err, false);
    }
    }
  ));

//google strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/dashboard"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    FlyUser.findOrCreate({ googleId: profile.id, name: profile.displayName, imgurl : profile._json.picture}, function (err, user) {
      return cb(err, user);
    });
  }
));


//facebook strategy
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/dashboard"
  },
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    FlyUser.findOrCreate({ facebookId: profile.id, name: profile.displayName}, function (err, user) {
      return cb(err, user);
    });
  }
));

//serialize and deserialize
passport.serializeUser(function(user, done) {
    console.log("serialize");
    process.nextTick(function() {
      return done(null, {
        id: user._id,
        username: user.username,
        picture: user.picture
      });
    });
  });
  
  passport.deserializeUser(function(user, done) {
    console.log("deserialize");
    process.nextTick(function() {
      return done(null, user);
    });
  });



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

//creating storage
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



app.get("/", (req,res) => {
    console.log(req.session);
    res.render("index.ejs");
});


//google login
app.get("/auth/google", passport.authenticate("google", { 
    scope : ["profile"]  
}));

//facebook login
app.get('/auth/facebook',
  passport.authenticate('facebook'));

//authentcating google user
app.get("/auth/google/dashboard", 
  passport.authenticate("google", { failureRedirect: "/login" }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/dashboard");
  });

//authenticating facebook user
app.get('/auth/facebook/dashboard',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect("/dashboard");
  });

app.get("/user", (req,res) => {
    res.render("register.ejs");
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


//protected page requires authentication
app.get("/dashboard", async(req,res) => {
    
    console.log(req.user);
    console.log(req.session);
    if(req.isAuthenticated()) {
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
    } else {
        console.log("oops");
        res.redirect("/login");
    }
        
    
    //console.log(files);
    //res.render("user.ejs")
});


//get register 
app.get("/register", async(req,res)=> {
    res.render("register.ejs",);
});

//get login 
app.get("/login", async(req,res)=> {
    res.render("login.ejs");
});


app.get("/logout" ,(req,res) => {
    req.logout((err)=> {
        if(err) {
            console.log(err);
        }
        res.redirect("/");
    });
    
});

//post register
app.post("/register" ,async(req,res) => {
    const hash = await bcrypt.hash(req.body.password,saltRounds);

    const newUser = new FlyUser({
        username: req.body.username,
        name: req.body.fname+req.body.lname,
        password: hash
    });

    try {
        await newUser.save();
        req.login(newUser, function(err) {
            if (err) { 
                console.log(err);
                return err;
            } else {
                passport.authenticate("local")(req,res , ()=> {
                    return res.redirect("/dashboard");
                }); 
            }
            
          });
        // res.redirect("/dashboard");
    }catch(err) {
        console.log(err.message);
        res.render("register.ejs",{err: err.message});
    } 
});

//post login
app.post("/login",passport.authenticate("local", { failureRedirect: '/login', failureMessage: true }),async(req,res)=> {


    //if auth success then we have req.user property
    const username = req.body.username;
    const password = req.body.password;
    console.log(req.user);
    res.redirect("/dashboard");
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