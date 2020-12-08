// Created by Ethan Chiu 2016
// Updated August 4, 2018

$(document).ready(function() {
  //Pulls info from AJAX call and sends it off to codemirror's update linting
  //Has callback result_cb
  var socket = io.connect('http://' + document.domain + ':' + location.port + '/check_disconnect');
  var click_count = 0;

  // fill std code into text editor
  $("#text-editor").append( "def foo(bar, baz):\n    pass\nfoo(42)");


  function check_syntax(code, result_cb) {
    //Example error for guideline
    var error_list = [{
      line_no: null,
      column_no_start: null,
      column_no_stop: null,
      fragment: null,
      message: null,
      severity: null
    }];

    //Push and replace errors
    function check(data) {
      //Clear array.
      error_list = [{
        line_no: null,
        column_no_start: null,
        column_no_stop: null,
        fragment: null,
        message: null,
        severity: null
      }];
      document.getElementById('linter-table').innerHTML = '';
      //Check if pylint output is empty.
      if (data == null) {
        result_cb(error_list);
      } else {
        $('#linter-table').append("<tr class=\"uk-animation-fade\">" + "<th>Line</th>" + "<th>Severity</th>" +
          "<th>Error</th>" + "<th>Tips</th>" +
          "<th>Error Info</th>" + "</tr>");
        var data_length = 0;
        if (data != null) {
          data_length = Object.keys(data).length;
        }
        for (var x = 0; x < data_length; x += 1) {
          if (data[x] == null) {
            continue
          }
          number = data[x].line
          code = data[x].code
          codeinfo = data[x].error_info
          severity = code[0]
          moreinfo = data[x].message
          message = data[x].error

          //Set severity to necessary parameters
          if (severity == "E" || severity == "e") {
            severity = "error";
            severity_span_label = "danger";
          } else if (severity == "W" || severity == "w") {
            severity = "warning";
            severity_span_label = "warning";
          }
          //Push to error list
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
        result_cb(error_list);
      }

    }
    //AJAX call to pylint
    $.post('/check_code', {
      text: code
    }, function(data) {
      current_text = data;
      check(current_text);
      return false;
    }, 'json');
  }

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
      "check_cb": check_syntax
    },
  });

  //run python interpreter on the code
  // and pycee to check for help on errors
  $("#run").click(function() {
    $.post('/run_code', {
      text: editor.getValue()
    }, function(data) {

      // clean answers
      cleanAnswers();
      // build new answers
      buildSOAnswers(data.answers_info, data.summarized_answers);
      buildPyceeAnswer(data.pycee_answer);
      printOutput(data.output);
      return false;
    }, 'json');

    function cleanAnswers(){
      // clean answers from screen when new code is run
      $('#so-answers-list').remove();
      $('#pycee-answer').remove();
    }

    function buildSOAnswers(answers_info, summarized_answers){
      // build an accordion for answers
      // each accordion consists of a card component
      if(!answers_info) return;
      
      //base div
      var soAnswersBaseDiv = `<div id="stackoverflow-answers" class="uk-container uk-margin-large uk-animation-fade">`+
      `<h3>StackOverflow Help</h3>`+
      `<ul id="so-answers-list" uk-accordion="collapsible: false"></ul></div>`;
      $('#content').append(soAnswersBaseDiv);

      // each card list item:
      for (i=0, len=answers_info.length; i<len; i++) {
        
        var answerCard = `<div class="uk-container uk-card uk-card-default uk-width-1-2@m">`+
          `<div class="uk-card-header">`+
            `<div class="uk-grid-small uk-flex-middle" uk-grid>`+
                `<div class="uk-width-auto">`+
                    `<img class="uk-border-circle" width="40" height="40" src="${answers_info[i].profile_image}">`+
                `</div>`+
                `<div class="uk-width-expand">`+
                    `<h3 class="uk-card-title uk-margin-remove-bottom">Answer ${i+1}</h3>`+
                    `<div class="uk-card-badge uk-label">Score: ${answers_info[i].score}</div>`+
                    `<p class="uk-text-meta uk-margin-remove-top">${answers_info[i].author}</p>`+
                `</div>`+
            `</div>`+
          `</div>`+
        `<div class="uk-card-body"><p>${summarized_answers[i]}</p></div>`+
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
    }

    function buildPyceeAnswer(answer){
      if(answer){
        var pyceeAnswerbaseDiv = `<div id="pycee-answer" class="uk-container uk-margin-large uk-animation-fade">`+
        `<h3>Pycee Help</h3>`+
        `<p id="pycee-text"></p></div>`;
        $('#content').append(pyceeAnswerbaseDiv);
        $("#pycee-text").append(answer);
      };
    }

    function printOutput(output) {
      document.getElementById('code-output').innerHTML = '';
      $("#code-output").append(`<pre>${output}</pre>`);
    }
  });

  var exampleCode = function(id, text) {
    $(id).click(function(e) {
      editor.setValue(text);
      editor.focus(); // so that F5 works, hmm
    });
  };

  exampleCode('#codeexample1', "methods = []\nfor i in range(10):\n    methodds.append(lambda x: x + i)\nprint(methods[0](10))");
  exampleCode('#codeexample2', "for i in range(5):\n    print(i)\n");
  exampleCode('#codeexample3', "print [x*x for x in range(20) if x % 2 == 0]");
  exampleCode('#codeexample4', "import numpy as np\narr = np.array([1,2,3])");
  exampleCode('#codeexample5', "print (\"%s:%r:%d:%x\\n%#-+37.34o\" % (\n        \"dog\",\n        \"cat\",\n        23456,\n        999999999999L,\n        0123456702345670123456701234567L))");
  exampleCode('#codeexample6', "def genr(n):\n    i = 0\n    while i < n:\n        yield i\n        i += 1\n\nprint(list(genr(12)))\n");
  exampleCode('#codeexample7', "# obscure C3 MRO example from Python docs\nclass O(object): pass\nclass A(O): pass\nclass B(O): pass\nclass C(O): pass\nclass D(O): pass\nclass E(O): pass\nclass K1(A,B,C): pass\nclass K2(D,B,E): pass\nclass K3(D,A): pass\nclass Z(K1,K2,K3): pass\nprint Z.__mro__\n");
});
