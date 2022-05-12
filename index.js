const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3100;

/** middle ware */
app.use(cors());
app.use(express.json());

/** connect to mongodb  */
const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.firic.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

/** api operation */
const run = async () => {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctros_portal")
      .collection("services");
    /** get all api */
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });
  } finally {
    /** nothing to happen here */
  }
};

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("helo world");
});

app.listen(port, () => {
  console.log(port, "port running ");
});
