const converter = new showdown.Converter();

let ws;
let response = "";
let conversationStarted = false;
let dontScroll = false;
const TMDB_API_KEY = '1ebffa92ced228d46f3f0cd722449757';

/**
 * Sets the text and disabled state of a submit button.
 * @param {string} value - The text to be displayed on the button.
 * @param {boolean} disabled - Whether the button should be disabled or not.
 */
function setButton(value, disabled) {
    var button = document.getElementById('send');
    button.innerHTML = value;
    button.disabled = disabled
    if(disabled) {
        button.classList.add("blink_me");
    } else {
        button.classList.remove("blink_me");
    }
}

/**
 * Picks an LLM model and sends a query to backend.
 * @param {string} model - The model to pick.
 * @returns {boolean} - Returns false.
 */
function pickModel(model){
    messageText.value = "!model " + model;
    messageText.focus();
    sendQuery();
    messageText.value = "";
    messageText.focus();
    return false;
}

/**
 * Sets the prompt template and cursor location in the message text input.
 * 
 * @param {string} template - The prompt template to set.
 * @param {number} cursorLocation - The cursor location in the message text input.
 */
function setPromptTemplate(template, cursorLocation){
    messageText.value = template;
    messageText.focus();
    messageText.selectionEnd = cursorLocation;
}

/**
 * Executes a system command to the backend.
 * 
 * @param {Event} e - The event object.
 */
function localCommandExecuted(e){
    const messageText = document.getElementById("messageText");
    switch(messageText.value.toLowerCase()){
        {% for template in conf.PROMPT_TEMPLATES %}
        case '#{{ template[0] }}':
            setPromptTemplate("{{ template[1]|safe }}", {{ template[2] }});
            if (e) e.preventDefault();
            return true;
        {% endfor %}
        default:
            return false;
    }
}

/**
 * Sends a query to the server via WebSocket.
 * @returns {void}
 */
function sendQuery() {
    if (localCommandExecuted()) return;
    if (!ws) return;
    conversationStarted = true;
    var message = document.getElementById('messageText').value;
    var rag = document.getElementById('rag').checked;
    if (message === "") {
        return;
    }

    // Clear the states of aux components
    clearButtons();
    clearMatchedMovies();

    payload = {
        query: message,
        rag,
        temperature: 1
    }
    ws.send(JSON.stringify(payload));
    setButton("{{ res.BUTTON_PROCESSING }}", true)
}

/**
 * Submits the form with preventing the default form submission behavior.
 * @param {Event} event - The event object.
 * @returns {void}
*/
function submitForm(event) {
    event.preventDefault();
    sendQuery();
}

function showRagOptions() {
    var queryControls = document.getElementById('query-controls');
    queryControls.style.display = 'block';

    var rag = document.getElementById('rag');
    rag.checked = true;

    sendQuery();
}

/**
 * Adds control buttons (Regenerate, Reset) after generation.
 * @returns {void}
*/
function appendButtons() {
    var buttons = document.getElementById('buttons');

    buttons.innerHTML=`
        <span class="btn btn-primary clip-button" onclick="sendQuery();"><img src="/static/img/copy.svg">&nbsp;&nbsp;<span id="clip-button-label">Regenerate</span></span>
        <span class="btn btn-outline-primary" onclick="document.location.reload();">Reset</span>
    `;

    var queryControls = document.getElementById('query-controls');
    if (queryControls.style.display != 'block') {
        buttons.innerHTML += `<div class="knowledge">My knowledge is limited to 2021. If you want more recent titles, I can <a href="javascript://" onclick="showRagOptions();">search in the external database</a> for you. Note, that this will take more time.</div>`;
    }
}

/**
 * Clears the generation control buttons by removing all its child elements.
 */
function clearButtons () {
    var buttons = document.getElementById('buttons');
    buttons.innerHTML = '';
}

/**
 * Establishes a WebSocket connection and handles incoming messages.
 */
function connect() {
    let wsBaseUrl = "{{ wsurl }}";
    if (wsBaseUrl === "") {
        let wsProtocol = "https:" === document.location.protocol ? 'wss://' : 'ws://'
        wsBaseUrl = wsProtocol + window.location.host;
    }
    ws = new WebSocket(wsBaseUrl + "/inference");
    ws.onmessage = function (event) {
        // var messages = document.getElementById('messages');
        var data = JSON.parse(event.data);
        handleResBotResponse(data, messages)

        // Scroll to the bottom of the chat (don't auto scroll if user has scrolled manually)
        if (!dontScroll){
            var topBox = document.getElementById("top-box");
            if (topBox) {
                topBox.scrollTop = topBox.scrollHeight;
            }
        }
        // if (!dontScroll){
        //     messages.scrollTop = Math.floor(messages.scrollHeight - messages.offsetHeight)
        // }
    };
    ws.onopen = function() {
        setButton("{{ res.BUTTON_SEND }}", false);
    };

    ws.onclose = function(e) {
        setButton("{{ res.BUTTON_WAIT }}", true);
        console.log('Socket is closed. Reconnect will be attempted in 1 second.', e.reason);
        setTimeout(function() {
            connect();
        }, 1000);
    };
}

/**
 * Adds a movie card to the movies container.
 * 
 * @param {Object} movie - The movie object.
 */
function addMovieCard(movie) {
    // console.log(movie);
    const moviesContainer = document.getElementById('movies-container'); // Ensure this div exists in your HTML
    const movieCard = document.createElement('div');
    movieCard.className = 'movie-card';
    movieCard.innerHTML = `<a href="#" onclick="showMovieDetails(event, ${JSON.stringify(movie).split('"').join("&quot;")})"><img src="https://image.tmdb.org/t/p/w500${movie.poster_path}" alt="${movie.title}" /></a>`;
    moviesContainer.appendChild(movieCard);
}

/**
 * Fetches movie information from the TMDB API based on the provided title and year.
 * @param {string} title - The title of the movie.
 * @param {number} year - The year of the movie.
 */
function fetchMovieInfo(title, year) {
    const apiKey = TMDB_API_KEY;
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(title)}&year=${year}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.results.length > 0) {
                const movie = data.results[0]; // Taking the first result
                addMovieCard(movie);
            }
        })
        .catch(error => console.error("Fetching movie info failed:", error));
}

let matchedMovies = [];
/**
 * Extracts movie titles and years from a given message and fetches movie info from TMDB API.
 * @param {string} message - The message containing movie titles and years.
 */
function extractAndFetchMovies(message) {
    const moviePattern = /\d\.\s"?(.+?)"? \((\d{4})\)/g;
    let match;
    while ((match = moviePattern.exec(message)) !== null) {
        const title = match[1].trim();
        const year = match[2];

        // Check if the movie has already been matched and fetched
        if (!matchedMovies.some(movie => movie.title === title && movie.year === year)) {
            // Add to matched movies to avoid refetching
            matchedMovies.push({ title, year });

            // Fetch movie info from TMDB API
            fetchMovieInfo(title, year);
        }
    }
}

/**
 * Clears the array of matched movies and removes all movie elements from the movies container.
 */
function clearMatchedMovies() {
    matchedMovies = [];
    const moviesContainer = document.getElementById('movies-container'); // Adjust if your container has a different ID
    moviesContainer.innerHTML = '';
}

/**
 * Displays movie details in a modal.
 * 
 * @param {Event} event - The event object.
 * @param {Object} movie - The movie object containing details.
 * @returns {void}
 */
function showMovieDetails(event, movie) {
    event.preventDefault(); // Prevent the default link action

    // Initialize the modal with available movie data
    const modalBody = document.querySelector('#movieDetailsModal .modal-body');

    // Display basic movie information first
    modalBody.innerHTML = `
        <div class="row movie-details">
            <div class="col-12 col-md-4  movie-poster">
                <img src="https://image.tmdb.org/t/p/original${movie.poster_path}" alt="${movie.title}" class="img-fluid" />
            </div>
            <div class="col-12 col-md-8 movie-info">
                <h1>${movie.title}</h1>
                <p class="movie-release-date">Release Date: ${movie.release_date}</p>
                <p class="movie-vote">Rating: ${movie.vote_average} (${movie.vote_count} votes)</p>
                <div class="movie-overview">
                    <h3>Overview</h3>
                    <p>${movie.overview}</p>
                </div>
                <!-- Placeholder for additional details -->
            </div>
            <div class="row" id="additional-movie-details"></div>
        </div>
    `;

    // Show the modal using Bootstrap's modal JS
    const modalElement = document.getElementById('movieDetailsModal');
    const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
    modal.show();

    // Fetch detailed movie info from TMDB API using the movie ID
    fetchMovieDetails(movie.id);
}

/**
 * Fetches movie details from the TMDB API and updates the additional details container with the fetched data.
 * @param {number} movieId - The ID of the movie to fetch details for.
 */
function fetchMovieDetails(movieId) {
    const apiKey = TMDB_API_KEY;
    const detailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${apiKey}&append_to_response=credits`;

    fetch(detailsUrl)
        .then(response => response.json())
        .then(details => {
            console.log(details);
            // Find the container for additional details
            const additionalDetailsContainer = document.getElementById('additional-movie-details');

            // Update the container with new fetched details
            additionalDetailsContainer.innerHTML = `
                <!-- Add any additional details you want from the fetched data -->
                <div class="container movie-cast">
                    <h2>Top Billed Cast</h2>
                    <div class="row cast-list">
                        ${details.credits.cast.slice(0, 8).map(actor => `
                            <div class="col cast-member">
                                <img src="https://image.tmdb.org/t/p/w154${actor.profile_path}" alt="${actor.name}" />
                                <h4>${actor.name}</h4>
                                <p class="character">${actor.character}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            document.getElementById('buttonImdb').href = `https://www.imdb.com/title/${details.imdb_id}`;
        })
        .catch(error => console.error("Fetching detailed movie info failed:", error));
}

/**
 * Handles the response from the bot.
 * 
 * @param {Object} data - The response data from the bot.
 * @param {HTMLElement} messages - The element to display the messages.
 */
function handleResBotResponse(data, messages) {
    switch(data.type) {
        
        // Create a container for the server message
        case "start":
            dontScroll = false;
            clearButtons();
            clearMatchedMovies();
            completeProgressBar();

            messages.innerHTML = '';
            response = "";

            var div = document.createElement('div');
            div.className = 'server-message';
            var p = document.createElement('p');
            response += data.message;
            p.innerHTML = converter.makeHtml(response);
            div.appendChild(p);
            messages.appendChild(div);
            break;

        // Append the bot's response to the message container
        case "stream":
            setButton("{{ res.BUTTON_TYPING }}", true);

            var p = messages.lastChild.lastChild;
            response += data.message;
            p.innerHTML = converter.makeHtml(response);

            extractAndFetchMovies(response);
            break;

        // Append the bot's final response to the message container
        case "end":
            var p = messages.lastChild.lastChild;
            p.innerHTML = converter.makeHtml(response);
            setButton('{{ res.BUTTON_SEND }}', false);
            appendButtons();
            break;

        case "done":
            setButton("{{ res.BUTTON_SEND }}", false);
            break;

        // Display an info message
        case "info":
            messages.innerHTML = '';
            var div = document.createElement('div');
            div.className = 'server-message';
            var p = document.createElement('p');
            // p.innerHTML = converter.makeHtml(data.message);
            p.innerHTML = data.message;
            div.appendChild(p);
            messages.appendChild(div);
            break;

        // Display progress bar for the prompt analysis period
        case "progress":
            startProgressBar(parseInt(data.message, 10), 11);
            break;

        // Finish and remove the progress bar
        case "progress-end":
            completeProgressBar();
            break;

        // Display a system message
        case "system":
            messages.innerHTML = '';
            var div = document.createElement('div');
            div.className = 'server-message';
            var p = document.createElement('p');
            p.innerHTML = data.message;
            div.appendChild(p);
            messages.appendChild(div);
            setButton("{{ res.BUTTON_SEND }}", false);
            break;

        // Display an error message
        case "error":
            messages.innerHTML = '';
            var div = document.createElement('div');
            div.className = 'server-message';
            var p = document.createElement('p');
            // p.innerHTML = converter.makeHtml(data.message);
            p.innerHTML = data.message;
            div.appendChild(p);
            messages.appendChild(div);
            setButton("{{ res.BUTTON_SEND }}", false);
            break;
    }
}

/**
 * Inserts the given text into the query input field
 * @param {string} text - The text to be inserted.
 */
function insertQuery(text) {
    const input = document.getElementById("messageText");
    if (input) {
        input.value = text; // Sets the input value to the link text
    }
}

let totalInferenceTime = 0; // Total inference time in seconds
/**
 * Starts the progress bar for the inference process.
 * 
 * @param {number} numTokens - The total number of tokens.
 * @param {number} tokensPerSecond - The number of tokens processed per second.
 */
function startProgressBar(numTokens, tokensPerSecond) {
    const progressBar = document.getElementById('inference-progress');
    const progressBarContainer = document.getElementById('progress-bar-container');

    // Calculate the estimated total time (in seconds) for processing
    const estimatedTotalTime = numTokens / tokensPerSecond;
    let elapsedTime = 0; // Track the elapsed time in seconds

    progressBarContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', 0);

    // Initialize progress variables
    let progress = 0;
    let lastProgress = 0;

    // Function to update progress with slowdown as it approaches the end
    const updateProgress = () => {
        elapsedTime += 0.1; // Increment by 0.1 since the interval is 100ms

        // Calculate the current progress as a percentage of the estimated total time
        // Use an asymptotic approach to slow down as it gets closer to 100%
        progress = (1 - Math.exp(-elapsedTime / estimatedTotalTime * 5)) * 100;

        // Prevent the progress from actually reaching 100%
        progress = Math.min(progress, 99.9);

        // Update the progress bar if there's noticeable progress to avoid too frequent DOM updates
        if (progress - lastProgress > 0.1) {
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            lastProgress = progress;
        }

        // If we have exceeded the estimated time, we stop updating
        // This prevents the progress bar from completing prematurely
        if (elapsedTime >= estimatedTotalTime * 10) {
            clearInterval(interval);
        }
    };

    // Update progress every 100ms
    const interval = setInterval(updateProgress, 100);

    // Store the interval ID to clear it later
    progressBar.setAttribute('data-interval-id', interval.toString());
}

/**
 * Completes the progress bar by setting it to 100% and optionally hiding it after a brief delay.
 */
function completeProgressBar() {
    const progressBar = document.getElementById('inference-progress');
    const intervalId = progressBar.getAttribute('data-interval-id');

    // Clear the update interval
    clearInterval(intervalId);

    // Set progress to 100%
    progressBar.style.width = '100%';
    progressBar.setAttribute('aria-valuenow', 100);

    // Optionally, hide the progress bar after a brief delay
    setTimeout(() => {
        document.getElementById('progress-bar-container').style.display = 'none';
    }, 100); // Adjust delay as needed
}

/**
 * Startup events bindings and app launch.
*/
document.addEventListener("DOMContentLoaded", function(event) {
    let topBox=document.getElementById("top-box");

    // Prevent autoscrolling when user has scrolled up
    ['touchmove', 'mousedown', 'select', 'wheel', 'scroll', 'mouseup', 'keydown', 'mousewheel'].forEach((evt) => {
        topBox.addEventListener(evt, (e) => {
            if(Math.floor(topBox.scrollTop) === Math.floor(topBox.scrollHeight - topBox.offsetHeight)) {
                dontScroll = false;
            }
            else{
                dontScroll = true;
            }
        });
    });

    // Keyboard hotkeys bindings
    const button = document.getElementById('send');
    const messageText = document.getElementById("messageText");
    messageText.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            if (!button.disabled) sendQuery();
            e.preventDefault();
        }
        if (e.key === "Tab") {
            localCommandExecuted(e);
            e.preventDefault();
        }
    })
    messageText.focus();

    connect();
});
