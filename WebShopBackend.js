const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bodyParser = require('body-parser');
const session = require('express-session');
const connectMongo = require('connect-mongo')(session);
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect('mongodb://localhost/webshop', { useNewUrlParser: true, useUnifiedTopology: true });

const productSchema = new mongoose.Schema({
  id: String,
  name: String,
  description: String,
  features: String,
  price: Number,
  keywords: String,
  url: String,
  category: String,
  subcategory: String,
  images: String,
});

const Product = mongoose.model('Product', productSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  cart: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      quantity: Number,
    },
  ],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
});

const User = mongoose.model('User', userSchema);

passport.use(new LocalStrategy((username, password, done) => {
  User.findOne({ username }, (err, user) => {
    if (err) return done(err);
    if (!user) return done(null, false, { message: 'Incorrect username.' });
    if (user.password !== password) return done(null, false, { message: 'Incorrect password.' });
    return done(null, user);
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

app.use(bodyParser.json());
app.use(session({
  secret: generateSecretKey(),
  resave: false,
  saveUninitialized: true,
  store: new connectMongo({ mongooseConnection: mongoose.connection }),
}));

app.use(passport.initialize());
app.use(passport.session());

// Function to generate a random secure key
const generateSecretKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// HTTPS configuration
const privateKey = fs.readFileSync('path/to/private-key.pem', 'utf8');
const certificate = fs.readFileSync('path/to/certificate.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Password validation middleware
const validatePassword = (password) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

// Shopping cart functionality
app.post('/add-to-cart', async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const product = await Product.findById(productId);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    const existingCartItem = user.cart.find(item => item.productId.toString() === productId);

    if (existingCartItem) {
      existingCartItem.quantity += quantity || 1;
    } else {
      user.cart.push({ productId, quantity: quantity || 1 });
    }

    await user.save();

    res.json({ message: 'Item added to the cart', user });
  } catch (error) {
    next(error);
  }
});

// Product listing route
app.get('/products', async (req, res, next) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    next(error);
  }
});

// Product details route
app.get('/products/:productId', async (req, res, next) => {
  try {
    const productId = req.params.productId;
    const product = await Product.findById(productId);

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Function to seed the database with products from products.json
const seedDatabase = async () => {
  try {
    const productsData = require('./products.json'); // Assuming products.json is in the same directory

    // Clear existing products in the database
    await Product.deleteMany({});

    // Insert products from the JSON file into the database
    await Product.insertMany(productsData);

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// Uncomment the following line to seed the database when the server starts
// seedDatabase();

// Start the server with HTTPS
const httpsServer = https.createServer(credentials, app);

httpsServer.listen(port, () => {
  console.log(`Server is running at https://localhost:${port}`);
});
