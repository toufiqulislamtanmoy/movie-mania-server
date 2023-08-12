const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const SSLCommerzPayment = require('sslcommerz-lts');
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

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = false //true for live, false for sandbox

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
    const pricingCollections = client.db("movieMonster").collection("pricing");
    const orderCollections = client.db("movieMonster").collection("order");

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

    app.get('/role/:email', async (req, res) => {
      const email = req.params.email;
      // console.log(email);
      const query = { email: email }
      const options = {
        projection: { role: 1, credit: 1 },
      };
      const result = await usersCollections.findOne(query, options);
      res.send(result);

    })

    // add a movie
    app.post('/addMovie', verifyJWT, verifyAdmin, async (req, res) => {
      const movieDetails = req.body;
      console.log(movieDetails);
      const result = await moviesCollections.insertOne(movieDetails);
      res.send(result);
    })

    // decrement credit when user click download button
    app.patch('/user/credit/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const findUser = await usersCollections.findOne(query);
      if (findUser && findUser.credit > 0) {
        const updatedUserCredit = await usersCollections.updateOne(query, { $inc: { credit: -1 } });
        res.send(updatedUserCredit);
      } else {
        res.send({ message: "Insufficient credits" });
      }
    })

    // pricing 
    app.get("/plans", async (req, res) => {
      const result = await pricingCollections.find().toArray();
      res.send(result);
    })

    app.post("/buycredit", async(req,res) =>{
      const purchesInfo = req.body;
      const query = { _id: new ObjectId(purchesInfo.plansid)};
      const plan = await pricingCollections.findOne(query);
      // console.log(purchesInfo);
      // console.log(plan);
      const transactionId= new ObjectId().toString();
      // sslcommerze
      const data = {
        total_amount:plan?.price,
        currency: 'BDT',
        tran_id: transactionId, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${transactionId}`,
        fail_url: 'http://localhost:3030/fail',
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: plan?.name,
        product_category: 'Credit',
        product_profile: 'general',
        cus_name: purchesInfo?.displayName,
        cus_email: purchesInfo?.email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
    };
    // console.log(data);
    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
    sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send({url:GatewayPageURL})
        const order = {
          plansid: purchesInfo.plansid,
          customerName: purchesInfo.displayName,
          customerEmail: purchesInfo.email,
          customerId: purchesInfo.uid,
          planName: plan.name,
          price: plan.price,
          description: plan.description,
          paymentStatus: false,
          transactionId,
          totalCredit: plan.creditAmount + parseInt(plan.bonusCredits)
        };
        // console.log("Order: ",order);
        const insertOrder = orderCollections.insertOne(order);
    });
      //sslcommerze end
      app.post("/payment/success/:transID", async(req,res)=>{
        
        const findOrder = await orderCollections.findOne({ transactionId: req.params.transID});
        console.log(findOrder?.customerEmail);
        const orderUpdateResult = await orderCollections.updateOne(
          { transactionId: req.params.transID },
          { $set: { paymentStatus: true } }
          );
          console.log('update payment status');

          const userUpdateResult = await usersCollections.updateOne(
            { email: findOrder.customerEmail },
            { $set: { credit: findOrder.totalCredit } }
          );

          if(userUpdateResult.modifiedCount>0){
           res.redirect(`https://movie-monster-fa66c.web.app/paymentsuccess/${req.params.transID}`)
          }
      })
    })

    app.get('/order/:tranID', async(req,res)=>{
      const transactionID = req.params.tranID;
      const orderDetail = await orderCollections.findOne({transactionId:transactionID});
      res.send(orderDetail);
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