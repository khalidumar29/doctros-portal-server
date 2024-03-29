const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
const sgTransport = require("nodemailer-sendgrid-transport");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const res = require("express/lib/response");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRATE_KEY);
const app = express();
const port = process.env.PORT || 3100;

/** middle ware */
app.use(cors());
app.use(express.json());

/** cors middleware */
const corsOptions = {
  origin: "https://doctros-portal-server.vercel.app",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

/** connect to mongodb  */
const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.firic.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

/** jwt token verification function as we middleware */
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unatohorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCES_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

/** nodemailer client setup */
const emailSenderOption = {
  auth: {
    api_key: process.env.EMAIL_SENDER_KEY,
  },
};
const emailClient = nodemailer.createTransport(sgTransport(emailSenderOption));

/** sendgrid email send function using nodemailer */
const sendAppointmentEmail = (booking) => {
  const { patient, patientName, treatment, date, slot } = booking;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `Your Appointment for ${treatment} is on at ${slot} is Confirmd`,
    text: "`Your Appointment for ${treatment} is on at ${slot} is Confirmd`",
    html: `
    <div>
    <p>Hello, ${patient}</p>
    <h3>Your Appointment for ${treatment} is confirmd</h3>
    <p>Looking for forward to seeing you on ${date} at ${slot}.</p>
    <h3>Our Address</h3>
    <p>Andor killa bandor bon</p>
    <p>Bangladesh</p>
    <a href="https://google.com">Unsubscribe</a>
    </div>
    `,
  };
  emailClient.sendMail(email, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
};

/** sendgrid email send for transaction id  */
const paymentConfirmtionEmail = (booking) => {
  const { patient, patientName, treatment, date, slot } = booking;
  const email = {
    from: process.env.EMAIL_SENDER,
    to: patient,
    subject: `we have recievied payment for ${treatment} is on at ${slot} is Confirmd`,
    text: `Your Appointment for ${treatment} is on at ${slot} is Confirmd`,
    html: `
    <div>
    <p>Hello, ${patient}</p>
    <h3>thanks for your payment.</h3>
    <h3>we have recevied your payment.</h3>
    <p>Looking for forward to seeing you on ${date} at ${slot}.</p>
    <h3>Our Address</h3>
    <p>Andor killa bandor bon</p>
    <p>Bangladesh</p>
    <a href="https://google.com">Unsubscribe</a>
    </div>
    `,
  };
  emailClient.sendMail(email, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Message sent: ", info);
    }
  });
};

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
    const userCollection = client.db("doctros_portal").collection("users");
    const doctorCollection = client.db("doctros_portal").collection("doctors");
    const paymentCollection = client
      .db("doctros_portal")
      .collection("payments");

    /** admin verification function */
    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        next();
      } else {
        res.status(403).send({ message: "forbidden access" });
      }
    };

    /** get all api */
    app.get("/service", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    });

    /** get all user  */
    app.get("/user", verifyJwt, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    /** verify admin */
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      const isAdmin = user.role === "admin";
      res.send({ admin: isAdmin });
    });

    /** user inset using put method */
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email }, process.env.ACCES_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ result, token });
    });

    /** make an user to admin */
    app.put("/user/admin/:email", verifyJwt, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const filter = { email };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    /** Avaiable treatment base on date and slots */

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

    /** get booking  */
    app.get("/booking", verifyJwt, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingsCollection.find(query).toArray();
        return res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    /** get booking useing id */
    app.get("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
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
      sendAppointmentEmail(booking);
      return res.send({ success: true, result });
    });

    /** payment informtion update */
    app.patch("/booking/:id", async (req, res) => {
      const id = req.params;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          trxid: payment.trxid,
        },
      };
      const result = await paymentCollection.insertOne(payment);
      const updateBooking = await bookingsCollection.updateOne(
        filter,
        updateDoc
      );
      res.send(updateBooking);
    });

    /** post doctor  */
    app.post("/doctor", async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    });

    /** get all doctor */
    app.get("/doctor", async (req, res) => {
      const doctors = await doctorCollection.find().toArray();
      res.send(doctors);
    });

    /** DELETE DOCTOR */
    app.delete("/doctor/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    });

    /** payment itent api */
    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
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
