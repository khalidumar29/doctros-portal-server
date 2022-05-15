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
    const bookingsCollection = client
      .db("doctros_portal")
      .collection("bookings");

    /** get all api */
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });

    /**  */

    app.get("/avaiableServices", async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingsCollection.find(query).toArray();
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (book) => book.treatment === service.name
        );
        const bookedSlots = serviceBookings.map((book) => book.slot);
        const available = service.slots.filter(
          (slot) => !bookedSlots.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    /** insert api  */
    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
      };
      const exists = await bookingsCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingsCollection.insertOne(booking);

      return res.send({ success: true, result });
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
