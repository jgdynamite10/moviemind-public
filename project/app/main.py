"""Main entrypoint for the app."""
import json
import logging
import os
import pandas as pd
import resources as res
from importlib import import_module
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
from llama_cpp import Llama
from transformers import GPT2Tokenizer
from schemas import WSMessage
from sysinfo import get_html_system_state
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

# Initialization
#
# Port to bind to
DEFAULT_PORT=8123
DB_FAISS_PATH = '../vectorstore/db_faiss'

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

logging.basicConfig()
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Load the configuration
config_module = os.getenv("CONFIGURATION") if os.getenv("CONFIGURATION") != None else "default"
logger.info("Configuration: %s " % config_module)
conf = import_module("configuration." + config_module)

max_threads = 8 # Use multi-threading for LLM
models_folder = os.getenv("MODELS_FOLDER") if os.getenv("MODELS_FOLDER") != None else "../models"

async def send(ws, msg: str, type: str):
    """
    Sends a message over a WebSocket connection.

    Parameters:
    - ws (WebSocket): The WebSocket connection to send the message on.
    - msg (str): The message to send.
    - type (str): The type of the message.

    Returns:
    None
    """
    message = WSMessage(sender="bot", message=msg, type=type)
    await ws.send_json(message.dict())

@app.on_event("startup")
async def startup_event():
    """
    Function that is called when the application starts up.
    It initializes global variables and loads necessary models and data.

    Args:
        None

    Returns:
        None
    """
    global db
    global llm
    global tokenizer
    global model_name
    global stop_words
    global gpu_layers

    # Load the FAISS vector store
    embeddings = HuggingFaceEmbeddings(
        model_name='sentence-transformers/all-MiniLM-L6-v2',
        model_kwargs={'device': 'cpu'}
    )
    db = FAISS.load_local(DB_FAISS_PATH, embeddings, allow_dangerous_deserialization=True)

    # Initialize the tokenizer
    tokenizer = GPT2Tokenizer.from_pretrained("gpt2")

    # LLM initialization
    model_name = conf.MODEL
    stop_words = conf.STOP_WORDS
    gpu_layers = conf.GPU_LAYERS

    llm = Llama(model_path=os.path.join(models_folder, model_name), n_ctx=conf.CONTEXT_TOKENS, n_threads=max_threads, use_mlock=False, n_gpu_layers=conf.GPU_LAYERS)

    logging.info("Server started")

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    """
    Returns the favicon.ico file as a response.

    :return: FileResponse object containing the favicon.ico file.
    """
    return FileResponse("static/favicon.ico")

@app.get("/")
async def get(request: Request):
    """
    Handle GET requests to the root endpoint.

    Args:
        request (Request): The incoming request object.

    Returns:
        TemplateResponse: The response containing the rendered "index.html" template.
    """
    return templates.TemplateResponse("index.html", {
        "request": request,
        "res": res,
        "conf": conf
    })

@app.get("/inference.js")
async def get(request: Request):
    """
    Handle GET requests to '/inference.js' endpoint.

    Args:
        request (Request): The incoming request object.

    Returns:
        TemplateResponse: The template response containing 'inference.js' template,
        along with the request, wsurl, res, and conf variables.
    """
    return templates.TemplateResponse("inference.js", {
        "request": request,
        "wsurl": os.getenv("WSURL", ""),
        "res": res,
        "conf": conf
    })

def formatMovies(documents):
    """
    Formats a list of movie documents into a string representation.

    Args:
        documents (list): A list of movie documents.

    Returns:
        str: A formatted string representation of the movies.
    """
    formatted_movies = []

    for doc in documents:
        meta = doc.metadata
        release_date = meta.get('release_date', 'N/A')
        # Check if release_date is NaN or not a valid string
        if pd.isna(release_date) or release_date == 'N/A':
            year = 'N/A'
        else:
            # Directly extract the year from the Timestamp object
            year = release_date.year        

        movie_details = f"""ID: {meta.get('id', 'N/A')}
{meta.get('title', 'N/A')} ({year})
{meta.get('genres', 'N/A')}
{meta.get('overview', 'N/A')}"""

        formatted_movies.append(movie_details)

    return "\n\n".join(formatted_movies)

async def parseCommands(websocket, query: str):
    """
    Parses the commands received from the user and performs the corresponding actions.

    Args:
        websocket: The WebSocket connection object.
        query (str): The command/query received from the user.

    Returns:
        bool: True if the command was successfully parsed and executed, False otherwise.
    """
    global llm
    global tokenizer
    global model_name
    global stop_words
    global gpu_layers

    # Check if the query is a command
    if not query.startswith("!"):
        return False

    # Output help message
    if query.lower() == "!help":
        await send(websocket, res.HELP, "system")
        return True

    # Load model with certain name
    if query.lower().startswith("!model "):
        model_args = query.strip().split(" ")
        if len(model_args) == 2:
            await send(websocket, "Loading: %s..." % model_args[1], "info")
            try:
                logger.info("Switching model to: %s" % model_args[1])
                llm = Llama(model_path=os.path.join(models_folder, model_args[1]), n_ctx=conf.CONTEXT_TOKENS, n_threads=max_threads, use_mlock=True, n_gpu_layers=gpu_layers)
                model_name = model_args[1]
            except:
                logger.error("failed to load model: %s " % model_args[1])
                await send(websocket, "Failed to load model: %s" % model_args[1], "error")
                return True
            await send(websocket, "Model loaded: %s" % model_name, "system")
        else:
            await send(websocket, "Usage: !model path/to/model.bin", "system")
        return True

    # Output current model
    if query.strip().lower() == "!model":
        await send(websocket, "Current model: %s" % model_name, "system")
        return True

    # List available models
    if query.strip().lower() == "!models":
        await send(websocket, "Available Models:\n", "start")
        for subdir, dirs, files in os.walk(models_folder, topdown=True):
            for file in sorted(files):
                model_file = os.path.join(subdir, file).replace(models_folder + "/", "")
                await send(websocket, "* <a href=\"#\" onclick=\"pickModel('%s')\">%s</a>\n" % (model_file, model_file), "stream")
        await send(websocket, "", "done")
        return True

    # Output system information
    if query.strip().lower() == "!system":
        await send(websocket, get_html_system_state(), "system")
        return True

    # Set stop words
    if query.lower().startswith("!stop "):
        stop_args = query.strip().split(" ")
        stop_arg = "".join(stop_args[1:])
        stop_words = stop_arg.replace(" ", "").split(",")
        await send(websocket, "Stop words set: %s" % stop_words, "system")
        return True

    # Output current stop words
    if query.strip().lower() == "!stop":
        await send(websocket, "Current stop words: %s" % stop_words, "system")
        return True

    # Get GPU layers
    if query.strip().lower() == "!gpu":
        await send(websocket, "Current GPU layer count: %s" % gpu_layers, "system")
        return True

    # Set GPU layers
    if query.lower().startswith("!gpu "):
        gpu_args = query.strip().split(" ")
        gpu_arg = "".join(gpu_args[1:])
        gpu_layers = gpu_arg
        await send(websocket, "GPU layers set to %s" % gpu_layers, "system")
        return True

    # Unknown command
    query_args = query.strip().split(" ")
    await send(websocket, "Unknown command: %s" % query_args[0], "system")
    return True

@app.websocket("/inference")
async def websocket_endpoint(websocket: WebSocket):
    """
    Handles the WebSocket connection for the Moviemind AI Cinema Advisor.

    Parameters:
        websocket (WebSocket): The WebSocket connection object.

    Returns:
        None

    Raises:
        WebSocketDisconnect: If the WebSocket connection is disconnected.

    """
    global db

    await websocket.accept()
    await send(websocket, """Hello!👋 I'm Moviemind, your AI Cinema Advisor. I specialize in tailoring movie recommendations to your tastes. Start by using keywords "recommend" or "similar" with your chosen movies, genres, or themes. So, what's on your mind today?<br><br>You can try these: <ul><li><a href="#" onclick="insertQuery(this.textContent)">I love Kingdom of Heaven, Robin Hood and Troy</a></li><li><a href="#" onclick="insertQuery(this.textContent)">Similar to Green Mile, Forrest Gump and Fight Club</a></li><li><a href="#" onclick="insertQuery(this.textContent)">Recommend me sci-fi comedy drama</a></li></ul>""", "info")

    while True:
        try:
            response_complete = ""
            start_type = ""

            received_text = await websocket.receive_text()
            payload = json.loads(received_text)

            # Parse query for commands. Skip chat if a command was executed
            if await parseCommands(websocket, payload["query"]):
                continue

            # Generate response using external movies DB (vector)
            if (payload['rag'] == True):
                message = "Analyzing request... "
                await send(websocket, message, "info")

                # Generate genres for each movie from user input
                prompt = f"""[INST]<<SYS>>Determine genres for each movie from %USER_INPUT%. Summarize all genres and output 5.<</SYS>>
%USER_INPUT%: {payload['query']}
OUTPUT FORMAT: 5 keywords[/INST]
ASSISTANT:"""

                # Count tokens in the prompt
                tokens = tokenizer.tokenize(prompt)
                num_tokens = len(tokens)
                await send(websocket, str(num_tokens), "progress")
                logger.info(f"Number of tokens in the prompt: {num_tokens}")

                # Generate response using LLM
                logger.info("Prompt: %s " % prompt)
                res = llm(prompt,
                         echo=False,
                         stream=False,
                         temperature=0.5,
                         top_k=1,
                         top_p=1,
                         repeat_penalty=10,
                         max_tokens=100,
                         stop=stop_words)
                logger.info(res)
                await send(websocket, "", "progress-end")

                message += "Searching database... "
                await send(websocket, message, "info")

                # Search vector database based on the genres
                query = res.get("choices", [])[0].get("text", "")
                docs = db.similarity_search(query, 3, filter=lambda d: d["vote_average"] > 7.0 and d["vote_count"] > 100)
                formattedMovies = formatMovies(docs)

                message += "Analyzing results..."
                await send(websocket, message, "info")

                # Generate recommendations using extracted movies and user input
                prompt = f"""[INST]
<<SYS>>You are a cinema assistant. Use SUGGESTED MOVIES and your knowledge to recommend 3 movies based on MY INPUT in an ordered list.<</SYS>>

SUGGESTED MOVIES: 
{formattedMovies}

MY INPUT: {query}

OUTPUT FORMAT: 
- Summarize input with genre, style and mood in assumption manner. Don't mention titles and cast (100 chars max) 
- 3 movies in an ordered list
- Each movie on a new line: Title (Year) — 75 chars summary[/INST]
ASSISTANT:"""

            # Generate recommendations without using external movies DB
            else:
                await send(websocket, "Analyzing request...", "info")
                prompt = f"""[INST]<<SYS>>You are a cinema expert. Recommend me 3 similar movies based on MY INPUT in an ordered list.<</SYS>>
MY INPUT: {payload["query"]}
OUTPUT FORMAT: 
- Summarize input with genre, style and mood in assumption manner. NO titles and cast (100 chars max) 
- Each movie on a new line: Title (Year) — 75 chars summary mentioning top cast and plot
[/INST]
ASSISTANT:"""

            # Count tokens in the prompt
            tokens = tokenizer.tokenize(prompt)
            num_tokens = len(tokens)
            await send(websocket, str(num_tokens), "progress")
            logger.info(f"Number of tokens in the prompt: {num_tokens}")

            start_type="start"
            logger.info("Temperature: %s " % payload["temperature"])
            logger.info("Prompt: %s " % prompt)

            # Generate response using LLM
            for i in llm(prompt,
                         echo=False,
                         stream=True,
                         temperature=payload["temperature"],
                         top_k=conf.TOP_K,
                         top_p=conf.TOP_P,
                         repeat_penalty=conf.REPETATION_PENALTY,
                         max_tokens=conf.MAX_RESPONSE_TOKENS,
                         stop=stop_words):
                response_text = i.get("choices", [])[0].get("text", "")
                if response_text != "":
                    answer_type = start_type if response_complete == "" else "stream"
                    response_complete += response_text
                    await send(websocket, response_text, answer_type)

            await send(websocket, "", "end")

        # Handle WebSocket disconnect            
        except WebSocketDisconnect:
            logging.info("websocket disconnect")
            break
        # Handle other exceptions
        except Exception as e:
            logging.error(e)
            await send(websocket, "Sorry, something went wrong. Try again.", "error")

# Run the app
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=DEFAULT_PORT)
