// Created by Ethan Chiu 2016
// Updated August 4, 2018

$(document).ready(function() {
  //Pulls info from AJAX call and sends it off to codemirror's update linting
  //Has callback result_cb
  var socket = io.connect('http://' + document.domain + ':' + location.port + '/check_disconnect');

  //run python interpreter on the code
  // and pycee to check for help on errors
  $("#run").click(runCode);

  exampleCode('#attribute-error-example', 'import requests\nresponse = requests.get("http://www.randomnumberapi.com/api/v1.0/random?count=1")\n# response.json() is the actual method name\nrandom_number=response.get_json()');
  exampleCode('#type-error-example', 'a_list = [5,1,2,6]\nsorted_list = a_list.sort()\nprint(f"First element is {sorted_list[0]}")');
  exampleCode('#index-error-example', "# Brazil world cup titles by year\nworld_cup_titles = [1958,1962,1970,1994,2002]\n# print year of the 5th title\nprint(world_cup_titles[5])");
  exampleCode('#name-error-example', "def fibonacci(n):\n    if n <= 1:\n        return n\n    else:\n        return(fibonacci(n-1) + fibonacci(n-2))\n\nfibonnaci(6)");
  exampleCode('#module-not-found-error-example', "import numpy as np\n...\ninitial_array = np.arange(15).reshape(3, 5)");
  exampleCode('#value-error-example', 'available_ports = [7785, 7795, 8005]\n...\nmain_port, alternative_port = available_ports');
  exampleCode('#syntax-error-example', "for i in range(10)\n    print('Hello world')");
});

function runCode() {
  /* Coordinate code run */

  $.post('/run_code', { text: editor.getValue()}, function(data){

    // clear output from last run
    $('#so-answers-list').remove();
    $('#pycee-answer').remove();
    
    // debugging
    console.log(data);

    // build new answers
    buildSOAnswers(data.answers_info);
    buildPyceeAnswer(data.pycee_answer);
    printOutput(data.output);
    return false;
    
  }, 'json');

}

function checkSyntax(code, result_cb) {
  /* Coordinate syntax check  */

  // Push and replace errors
  function check(data) {
    
    // Clear errors array and table.
    var error_list = [];

    // Check if pylint output is empty.
    if (data != null) 
      error_list = buildLinterTable(data, error_list);
    
    // not sure what this does yet
    result_cb(error_list);

  };

  //AJAX call to pylint
  $.post('/check_code', {text: code}, function(data) {
    current_text = data;
    $('#linter-table').remove();
    check(current_text);
    return false;
  }, 'json');
}

/* CodeMirror editor instance */
var editor = CodeMirror.fromTextArea(document.getElementById("text-editor"), {
  mode: {
    name: "python",
    version: 3,
    singleLineStringErrors: false
  },
  lineNumbers: true,
  indentUnit: 4,
  matchBrackets: true,
  lint: true,
  styleActiveLine: true,
  gutters: ["CodeMirror-lint-markers"],
  lintWith: {
    "getAnnotations": CodeMirror.remoteValidator,
    "async": true,
    "check_cb": checkSyntax
  },
});


/* Functions to build UI elements according to results from backend */

function exampleCode(id, text) {
  /* fill examples into the editor */
  $(id).click(function(e) {
    editor.setValue(text);
    editor.focus(); // so that F5 works, hmm
  });
};


function printOutput(output) {
  /* Print code output */
  document.getElementById('code-output').innerHTML = '';
  $("#code-output").append(`<pre>${output}</pre>`);
};

function buildLinterTable(data, error_list){
  /* Build linter table with all linting warnings and errors */

  // clear table from previous results
  $('#linter-output').remove();

  // Linter table main div and table header
  var linterTableBaseDiv = `<div id="linter-output" class="uk-container uk-animation-fade">`+
    `<h3>Pylint Output Info</h3>`+
    `<table id="linter-table" class="uk-table uk-table-small uk-table-divide">`+
    `<tr>`+
      `<th>Line</th>`+
      `<th>Severity</th>`+
      `<th>Error</th><th>Tips</th>`+
      `<th>Error Info</th>`+
    `</tr>`+
    `</table>`+
  `</div>`;
  
  $('#content').append(linterTableBaseDiv);

  var data_length = Object.keys(data).length;
  
  for (var x = 0; x < data_length; x += 1) {
    
    if (data[x] == null) continue;

    number = data[x].line;
    code = data[x].code;
    codeinfo = data[x].error_info;
    severity = code[0].toLowerCase();
    moreinfo = data[x].message;
    message = data[x].error;

    // format severity
    if (severity == "e"){
      severity = "error";
      severity_span_label = "danger";
    }
    else if (severity == "w"){
      severity = "warning";
      severity_span_label = "warning";
    }

    error_list.push({
      line_no: number,
      column_no_start: null,
      column_no_stop: null,
      fragment: null,
      message: message,
      severity: severity
    });

    //Get help message for each id
    // var moreinfo = getHelp(id);
    //Append all data to table
    $('#linter-table').append(
      `<tr class="uk-animation-slide-top-small"><td> ${number} </td>` +
      `<td><span class="uk-label uk-label-${severity_span_label}">${severity}</span></td>`+
      `<td uk-tooltip="title: ${code}; pos: top">${message}</td>`+
      `<td> ${moreinfo}</td>` +
      `<td>${codeinfo}</td></tr>`
    );
  }

  return error_list;

};


function buildSOAnswers(answers_info){
  /* build an accordion for answers
  each accordion consists of a card component */
  if(!answers_info) return;
  
  //base div
  var soAnswersBaseDiv = `<div id="stackoverflow-answers" class="uk-container uk-margin-large uk-animation-fade">`+
  `<h3>StackOverflow help</h3>`+
  `<ul id="so-answers-list" uk-accordion="collapsible: false"></ul></div>`;
  $('#content').append(soAnswersBaseDiv);

  // each card list item:
  for (i=0, len=answers_info.length; i<len; i++) {
    
    var answerCard = `<div class="uk-container uk-card uk-card-default uk-width-1-2@m">`+
      `<div class="uk-card-header">`+
        `<div class="uk-grid-small uk-flex-middle" uk-grid>`+
            `<div class="uk-width-auto">`+
                `<img class="uk-border-circle" width="40" height="40" src="${answers_info[i].profile_image||"#"}">`+
            `</div>`+
            `<div class="uk-width-expand">`+
                `<h3 class="uk-card-title uk-margin-remove-bottom">Answer ${i+1}</h3>`+
                `<div class="uk-card-badge uk-label">Score: ${answers_info[i].score}</div>`+
                `<p class="uk-text-meta uk-margin-remove-top">${answers_info[i].author}</p>`+
            `</div>`+
        `</div>`+
      `</div>`+
    `<div class="uk-card-body">${answers_info[i].body}</div>`+
    `<div class="uk-card-footer">`+
        `<a href="https://www.stackoverflow.com/a/${answers_info[i].id}" target="_blank" class="uk-button uk-button-text">`+
          `See original post on StackOverflow`+
        `</a>`+
    `</div>`+
  `</div>`;

    $('#so-answers-list').append(
      `<li><a class="uk-accordion-title" href="#">Answer ${i+1}</a>`+
      `<div class="uk-accordion-content">${answerCard}</div></li>`
    );
  }
};


function buildPyceeAnswer(answer){
  if(answer){
    var pyceeAnswerbaseDiv = `<div id="pycee-answer" class="uk-container uk-margin-large uk-animation-fade">`+
    `<h3>Pycee help</h3>`+
    `<pre id="pycee-text"></pre></div>`;
    $('#content').append(pyceeAnswerbaseDiv);
    $("#pycee-text").append(answer);
  };
}