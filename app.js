const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server Running at http://localhost:3001/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  try {
    const { username, name, password, gender } = request.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectedUser = `
        SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await db.get(selectedUser);
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else if (dbUser === undefined) {
      const createUser = `
            INSERT INTO 
                 user(username,name,password,gender)
            VALUES('${username}','${name}','${hashedPassword}','${gender}');`;
      await db.run(createUser);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send(`User already exists`);
    }
  } catch (e) {
    console.log(`error:'${e.message}'`);
  }
});

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const convertFollower = (dbObject) => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  };
};

const convertUser = (dbObject) => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  };
};

const convertTweet = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertReply = (dbObject) => {
  return {
    replyId: dbObject.reply_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    replies: dbObject.reply,
    dateTime: dbObject.date_time,
  };
};

const convertLike = (dbObject) => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { userId } = request.params;
  const getTweets = `
                SELECT
                username,tweet,date_time
                FROM
                (tweet left join user) as T left join follower on T.user_id =follower.follower_user_id
                group by 
                date_time
                limit 4;`;
  const tweetsArray = await db.all(getTweets);
  console.log(tweetsArray);
  response.send(tweetsArray.map((eachTweet) => convertTweet(eachTweet)));
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const getName = `
    SELECT 
      name
    FROM 
      user natural join follower
    ;`;
  const result = await db.get(getName);
  response.send(convertUser(result));
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getName = `
    SELECT 
      name
    FROM 
      user natural join follower
    ;`;
  const result = await db.get(getName);
  response.send(convertUser(result));
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetsQuery = `
    SELECT
      *
    FROM
      tweet
    WHERE
      tweet_id=${tweetId};`;
  const result = await db.get(getTweetsQuery);
  response.send(convertTweet(result));
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetsQuery = `
    SELECT
      *
    FROM
      like natural join tweet
    WHERE
      tweet_id=${tweetId};`;
    const result = await db.get(getTweetsQuery);
    response.send(convertLike(result));
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetsQuery = `
    SELECT
      *
    FROM
      reply
    WHERE
      tweet_id=${tweetId};`;
    const result = await db.get(getTweetsQuery);
    response.send(convertReply(result));
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getName = `
    SELECT 
      *
    FROM 
      user natural join tweet
    WHERE 
     tweet_id=${tweetId};`;
  const result = await db.get(getName);
  response.send(convertUser(result));
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const postTweetQuery = `
  INSERT INTO
    tweet (tweet)
  VALUES
    ('${tweet}');`;
  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const deleteTweetsQuery = `
  DELETE FROM
    tweet
  WHERE
    tweet_id = ${tweetId};`;
    await db.run(deleteTweetsQuery);
    response.send("Tweet Removed");
  }
);

module.exports = app;
