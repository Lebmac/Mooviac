<a id="readme-top"></a>

<!-- GETTING STARTED -->
## Getting Started

To get a local copy up and running follow these steps.

### Prerequisites

Install npm
* npm
  ```sh
  npm install npm@latest -g
  ```

Install nodemon
* nodemon
  ```sh
  npm install -g nodemon
  ```

Install pgAdmin
* pgadmin
  ```sh
  https://www.pgadmin.org/download/
  ```

Build "film" database and create cache and review tables

* pgadmin
  ```sh
  CREATE TABLE cache
  (
      id SERIAL PRIMARY KEY,
      title_id VARCHAR(10) UNIQUE,
      title TEXT,
      plot TEXT,
      image TEXT
  );

  CREATE TABLE review
  (
      id SERIAL PRIMARY KEY,
      rating INT,
      title TEXT,
      content TEXT,
      cache_id INT,
      AUTHOR VARCHAR(30),
      DATE TIMESTAMP NOT NULL DEFAULT now(),
      FOREIGN KEY (cache_id) REFERENCES cache(id)
  );
  ```


### Installation

_Below is an example of how you can instruct your audience on installing and setting up your app. This template doesn't rely on any external dependencies or services._

1. Clone the repo
   ```sh
   git clone https://github.com/github_username/repo_name.git
   ```
2. Install NPM packages
   ```sh
   npm install
   ```
3. Change git remote url to avoid accidental pushes to base project
   ```sh
   git remote set-url origin your_github_username/your_repo_name
   git remote -v # confirm the changes
   ```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- USAGE EXAMPLES -->
## Usage

1. Start script with nodemon
   ```sh
   nodemon index.js
   ```
2. View frontend in browser
   ```sh
   localhost:3000
   ```
3. Navigate to search IMDb and enter filter criteria
4. Browse cards and click to open detail window
5. Open review expander (bottom of page) to write and submit reviews to the local db
6. Navigate reviews on the home page and click on a card to open review detail window.
7. View, edit and delete reviews from the review detail window


<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- CONTRIBUTING -->
## Contributing

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- LICENSE -->
## License

Distributed under the Unlicense License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>