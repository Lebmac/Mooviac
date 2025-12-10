import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";

const app = new express();
const port = 3000;
const API_URL = "https://api.imdbapi.dev";

// CRUDs data to two tables in db "film"
// - cache(id(PK), title_id, title, plot, image) stores movie data pulled from IMDb to reduce API query count
// - review(id(PK), rating, title, content, cache_id(FK), author, date) stores user review data.
const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "film",
  password: "qwerty",
  port: 5432,
});
db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(express.static("views"));


app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
});

// ---------------------
// FRONTEND ENTRY POINTS
// ---------------------

//landing page
app.get("/", async (req,res) => {
  const response = await pullAllReviewsFromDB();
  var cards = [];

  response.rows.forEach((review) => {
    try {
      const card = {
        id: `review/${review.id}`,
        title: review.review_title,
        image: review.image,
        rating: review.rating,
      };
      
      cards.push(card);
    } catch {
      console.log("skipped card");
    }
  });
  
  res.render("index.ejs", { cards: cards });
});

// The user clicks search IMDb in the nav bar
// Or, if the default no-content card is visible, this can also be clicked
// pointerdown on either element invokes action get/search
// search.ejs queries IMDb and builds titles into simplified cards for the user to browse
app.get("/search", (req,res) => {
  res.render("search.ejs");
});

// The user enters search criteria on search.ejs
// Search button listens for pointerdown and actions post/search/body
app.post("/search", async (req,res) => {

  const response = await getMovieList(req.body);
  var cards = [];

  // Get movie list can return a null response if the IMDb API is unavailable
  // Error message is displayed to user on the filter partial which is used
  // on search.ejs

  // The API segregates title searching from other filters
  if (!Array.isArray(response?.titles)) { 
    res.status(500).render("search.ejs", { error: "Oops. Something went wrong."}); 
    return; 
  }

  // If no title was given by the user, query IMDb for filter params
  response.titles.forEach((movie) => {

    try {
      // titles can return with missing elements or different JSON structure
      // this allows the program to ignore elements it cannot interpret.
      const card = {
        id: `/detail/${movie.id}`,
        title: movie.primaryTitle,
        image: movie?.primaryImage?.url,
        genre: Array.isArray(movie?.genres) ? movie.genres[0] : movie?.genres,
        year: movie?.startYear,
        rating: Math.round(movie?.rating?.aggregateRating / 2),
      };
      
      cards.push(card);
    } catch {

      // some titles do not return with required data and must be ignored
      console.log("skipped card");
    }
  });

  res.render("search.ejs", { cards: cards });
});

// The user clicks a card on search.ejs
// The card listens for pointerdown and performs action get/detail/id
// detail.ejs is the detail display for IMDb titles, with collapsable review writer tool
app.get("/detail/:id", async (req,res) => {
  const response = await getMovieByIMDbID(req.params.id);
  const movie = response.data;

  // don't try to build card if response is missing
  // not tested. Error handling needs a similar build to post/search
  if (response.status === 500 ) { console.log(500); res.redirect("/"); }

  // titles can return with missing elements or different JSON structure
  // this allows the program to ignore elements it cannot interpret.
  const card = {
    id: movie.id,
    title: movie.primaryTitle,
    image: movie?.primaryImage?.url,
    genre: movie?.genres,
    year: movie?.startYear,
    rating: movie?.rating?.aggregateRating / 2,
    time: Math.round(movie?.runtimeSeconds / 60),
    director: getInnerAttributes(movie?.directors, "displayName"),
    stars: getInnerAttributes(movie?.stars, "displayName"),
    language: getInnerAttributes(movie?.spokenLanguages, "name"),
    plot: movie?.plot,
  };

  res.render("detail.ejs", { card: card });
});

// The user writes reviews on detail.ejs
// submit action performs post/review/id
app.post("/review/:id", async (req,res) => {
  const titleId = req.params.id;
  const rating = req.body.rating;
  const reviewTitle = req.body.title;
  const content = req.body.content;
  const movieTitle = req.body.movieTitle;
  const plot = req.body.plot;
  const image = req.body.image;

  // firstly: cache title data from IMDb so the app does not query it every time a review is opened
  // respond with the cache_id to pass to review db
  const response = await insertCacheDataToDB(titleId, movieTitle, plot, image)

  // secondly: create new row for user review with reference to cache foreign key
  const cacheId = response.rows[0].id;
  await insertReviewToDB(cacheId, rating, reviewTitle, content);

  res.redirect("/");
});

// The user explores user reviews on the landing page index.ejs
// Each review card listens for pointerdown and performs action get/review/id
// review.ejs is the detail display for user reviews. it fulfils read, update, delete project requirements
app.get("/review/:id", async (req,res) => {
  const response = await pullReviewByID(req.params.id);
  const review = response.rows[0];

  // review and cache data are pulled from pg and built into a detail card
  // to be interpreted by review.ejs (detail display for user reviews)
  const card = {
    id: review.id,
    reviewTitle: review.review_title,
    content: review.content,
    cacheTitle: review.cache_title,
    image: review.image,
    rating: review.rating,
    plot: review.plot,
    author: review.author,
    date: review.date,
  };

  res.render("review.ejs", { card: card });
});

// The user enters edit mode on review.ejs
// The editor tool makes and submits changes with action post/update/id
app.post("/update/:id", async (req,res) => {
  const id = req.params.id;
  const title = req.body.reviewTitle;
  const content = req.body.content;
  const author = req.body.reviewAuth;
  const rating = req.body.rating;

  await updateReviewByID(id, title, content, author, rating);

  res.redirect(`/review/${req.params.id}`);
});

// The user enters delete mode on review.ejs
// The delete tool gives the user a chance to change their mind
// Delete removes the post with action post/delete/id
// The user is navigated back to the landing page
app.post("/delete/:id", async (req,res) => {
  const id = req.params.id;
  console.log(id);
  await deleteReviewByID(id);

  res.redirect("/");
});

// The user searches for a review title in the nav bar
// The user is taken back to the landing page where a filtered list
// of reviews is displayed where title meets the search criteria.
app.get("/find", async (req, res) => {
  const response = await filterReviewByTitle(req.query.searchString);
  var cards = [];

  response.rows.forEach((review) => {
    try {
      const card = {
        id: `review/${review.id}`,
        title: review.review_title,
        image: review.image,
        rating: review.rating,
      };
      
      cards.push(card);
    } catch {
      console.log("skipped card");
    }
  });
  
  res.render("index.ejs", { cards: cards });
});

// ------------------
// IMDb API INTERFACE
// ------------------

// higher order function to determine best query method for user
// Used when user accesses search.ejs to pull data on up to 50 titles matching the search criteria
async function getMovieList(filter) {
  var query = "?";
  var result = [];

  // if user provides a title filter, query IMDb by title.
  // Other filters cannot be included.
  if (filter.title.length > 0) { 
    query += `query=${filter.title}`; 
    result = await getMovieListByTitle(query);

    return typeof(result?.data) == "undefined" ? null : result.data;
  }

  // else find movies fitting other user filter choices
  query += "types=MOVIE";

  if (filter?.genre.length > 0) { query += `&genres=${filter.genre}`; }
  if (filter?.year.length > 0) { query += `&startYear=${filter.year}`; }
  if (filter?.rating > 0) { query += `&minAggregateRating=${filter.rating * 2}`; }

  result = await getMovieListByQuery(query);

  return typeof(result?.data) == "undefined" ? null : result.data;
}

// Query API like "https://api.imdbapi.dev/search/titles?query=usertitle"
// Returns raw HTTP response, or null array if API does not respond
async function getMovieListByTitle(query) {
  const result = await axios.get(API_URL + `/search/titles` + query).then((response) => {
    return response;
  }).catch((error) => {
    console.log(`Unable to retrieve titles at ${API_URL}/search/titles${query}`);
    return [];
  });

  return result;
}

// Query API like "https://api.imdbapi.dev/titles?types=MOVIE&genres=genre&startYear=1234&minAggregateRating=4"
// Returns raw HTTP response, or null array if API does not respond
async function getMovieListByQuery(query) {
  const result = await axios.get(API_URL + `/titles` + query).then((response) => {
    return response;
  }).catch((error) => {
    console.log(`Unable to retrieve titles at ${API_URL}/search/titles${query}`);
    return [];
  });

  return result;
}

// Used when user accesses detail.ejs to pull richer data on the title
// Query API like "https://api.imdbapi.dev/titles/tt12345678"
// Returns raw HTTP response, or null array if API does not respond
async function getMovieByIMDbID(id) {
  const result = await axios.get(API_URL + `/titles/` + id).then((response) => {
    return response;
  }).catch((error) => {
    console.log(`Unable to retrieve titles at ${API_URL}/search/titles${query}`);
    return [];
  });

  return result;
}

// Access sub collections for building cards with IMDb returned title data
// This is used to get stars, genres, directors, and languages as arrays when more than one entry exists.
function getInnerAttributes(array, innerAttribute) {
  var attr = [];

  try {
    if (!Array.isArray(array)) {
      attr.push(array[innerAttribute])
    } else {
      array.forEach((el) => {
        attr.push(el[innerAttribute]);
      });
    }
  } catch {
    console.log(`Unable to parse ${array}[${innerAttribute}]`);
  }

  return attr;
}

// -------------------------
// POSTGRESQL CRUD FUNCTIONS
// -------------------------

// Push user generated review data to review table
async function insertReviewToDB(cacheId, rating, title, content) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
        `INSERT INTO review(cache_id, rating, title, content) 
         VALUES ($1, $2, $3, $4);`,
        [cacheId, rating, title, content]
      );
      console.log(`insertReviewToDB() executed successfully`);
    } catch (error) {
      console.log(`insertReviewToDB() error: ${error.message}`);
    }
    resolve(result);
  });
}

// Push IMDb title data to cache table
// Keep entries unique
// returns id of new or updated row.
async function insertCacheDataToDB(titleId, title, plot, image) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
         `INSERT INTO cache (title_id, title, plot, image)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (title_id)
          DO UPDATE SET
              title = EXCLUDED.title,
              plot  = EXCLUDED.plot,
              image = EXCLUDED.image
          RETURNING id;`,
        [titleId, title, plot, image]
      );
      console.log(`insertCacheDataToDB() executed successfully`);
    } catch (error) {
      console.log(`insertReviewToDB() error: ${error.message}`);
    }
    resolve(result);
  });
}

// Pull merged review and cache data for display on the landing page (index.ejs)
async function pullAllReviewsFromDB() {
    return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
       `SELECT review.id, rating, review.title AS review_title, content, title_id, cache.title AS cache_title, plot, image
        FROM review
        JOIN cache
        ON cache_id = cache.id`
      );
      console.log(`pullAllReviewsFromDB() executed successfully`);
    } catch (error) {
      console.log(`pullAllReviewsFromDB() error: ${error.message}`);
    }
    resolve(result);
  });
};

// Pull merged review and cache data for display on the detail page (review.ejs)
async function pullReviewByID(id) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
       `SELECT review.id, rating, review.title AS review_title, content, author, date, title_id, cache.title AS cache_title, plot, image
        FROM review
        JOIN cache
        ON cache_id = cache.id
        WHERE review.id = $1;`,
        [id]
      );
      console.log(`pullReviewByID() executed successfully`);
    } catch (error) {
      console.log(`pullReviewByID() error: ${error.message}`);
    }
    resolve(result);
  });
};

// Pull filtered list of reviews by navbar search criteria (filter by title only)
// (feature available on all pages, lands on index.ejs)
async function filterReviewByTitle(title) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
       `SELECT review.id, rating, review.title AS review_title, content, title_id, cache.title AS cache_title, plot, image
        FROM review
        JOIN cache
        ON cache_id = cache.id
        WHERE review.title LIKE '%' || $1 || '%';`,
        [title]
      );
      console.log(`filterReviewByTitle() executed successfully`);
    } catch (error) {
      console.log(`filterReviewByTitle() error: ${error.message}`);
    }
    resolve(result);
  });
};

// Push review updates to the review table
// writes all editable columns
async function updateReviewByID(id, title, content, author, rating) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
       `UPDATE review
        SET title = $2,
            content = $3,
            author = $4,
            rating = $5,
            date = NOW()
        WHERE id = $1;`,
        [id, title, content, author, rating]
      );
      console.log(`updateReviewByID() executed successfully`);
    } catch (error) {
      console.log(`updateReviewByID() error: ${error.message}`);
    }
    resolve(result);
  });
}

// Remove review from review table
async function deleteReviewByID(id) {
  return new Promise ((resolve) => {
    var result = "";
    try {
      result = db.query(
       `DELETE FROM review
        WHERE id = $1;`,
        [id]
      );
      console.log(`deleteReviewByID() executed successfully`);
    } catch (error) {
      console.log(`deleteReviewByID() error: ${error.message}`);
    }
    resolve(result);
  });
}