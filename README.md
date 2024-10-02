# Talking Time Machine

This is the model socket server of the chatbot application

## Usage

1. Clone the repo using the following command

```
$ git clone https://github.com/AmaySunilShenoy/TTM_model.git 
```

2. Install the dependencies

```
$ npm install
```

3. Add your own secrets in a `.env` file using the example keys in `.example.env`. This is where you can mention the `model` you want to use. The default is the `Llama 3` model.

4. Build the project

```
$ npm start
```

And there you go! The project should be setup and start on localhost:3002 or any port you have mentioned in the `.env` file


## Socket events

There are multiple pages on the application:

1. `init chat` - gets chat details and creates a new chat session to initialize the chat
2. `chat stream` - sends the stream chat output from the chat to the frontend
3. `chat message` - asks the user input to the chat model and streams the output
4. `chat message end`- marks the end of the chat output to the frontend

