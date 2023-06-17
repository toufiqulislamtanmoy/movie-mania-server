const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Movie Is Downloading")
})

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.zvd8xno.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
     client.connect();
    // Send a ping to confirm a successful connection

    const moviesCollections = client.db("movieMonster").collection("movies");
    const usersCollections = client.db("movieMonster").collection("users");

    /********JWT api call*******/
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
      res.send({ token });
    })


    // Verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await usersCollections.findOne(query);
      if (result?.role !== 'admin') {
        return res.status(403).send({ error: true, message: "forbidden access" });
      }
      next();
    }

    /********Find All the movies*******/
    app.get('/movies', async (req, res) => {
      const result = await moviesCollections.find().toArray();
      res.send(result);
    })
    /********Find Single Movie by id*******/
    app.get('/movies/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await moviesCollections.findOne(query);
      res.send(result);
    })
    /********Create user*******/
    app.post("/users", async (req, res) => {
      const userDetails = req.body;
      const query = { email: userDetails.email };
      const existingUser = await usersCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User Already Exist" });
      }
      const result = await usersCollections.insertOne(userDetails);
      res.send(result);
    })

    /********Find The user Role*******/

    app.get('/role/:email',async (req,res) =>{
      const email = req.params.email;
      // console.log(email);
      const query = {email:email}
      const options = {
        projection: {role: 1,credit:1},
      };
      const result = await usersCollections.findOne(query, options);
      res.send(result);
      
    })

    // add a movie
    app.post('/addMovie',verifyJWT,verifyAdmin, async(req,res) => {
      const movieDetails = req.body;
      console.log(movieDetails);
      const result = await moviesCollections.insertOne(movieDetails);
      res.send(result);
    })

    client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})