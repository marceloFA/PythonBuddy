"""Created originally by Ethan Chiu 10/25/16
v2.0.0 created on 8/4/18
Complete redesign for efficiency and scalability
Uses Python 3 now

v2.1.0 created on 5/10/19
Improve efficiency and design
 """
from datetime import datetime
from subprocess import Popen, PIPE, STDOUT
from multiprocessing import Pool, cpu_count

from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO
import eventlet.wsgi
from pylint import epylint as lint
import tempfile, mmap, os, re

# Pycee
from pycee.answers import get_answers
from pycee.errors import handle_error
from pycee.inspection import get_error_info
from pycee.utils import parse_args


from .pylint_errors import pylint_dict_final


def is_os_linux():
    return os.name != "nt"


# Configure Flask App
# Remember to change the SECRET_KEY!
app = Flask(__name__)
app.config["SECRET_KEY"] = "secret!"
app.config["DEBUG"] = True
socketio = SocketIO(app)

# Get number of cores for multiprocessing
num_cores = cpu_count()


@app.route("/")
def index():
    """Display home page
    :return: index.html

    Initializes session variables for tracking time between running code.
    """
    session["count"] = 0
    session["last_run_time"] = datetime.now()

    return render_template("index.html")


@app.route("/check_code", methods=["POST"])
def check_code():
    """Run pylint on code and get output
    :return: JSON object of pylint errors
        {
            {
                "code":...,
                "error": ...,
                "message": ...,
                "line": ...,
                "error_info": ...,
            }
            ...
        }

    For more customization, please look at Pylint's library code:
    https://github.com/PyCQA/pylint/blob/master/pylint/lint.py
    """
    # Session to handle multiple users at one time and to get textarea from AJAX call
    session["code"] = request.form["text"]
    text = session["code"]
    output = evaluate_pylint(text)

    # MANAGER.astroid_cache.clear()
    return jsonify(output)


# Run python in secure system
@app.route("/run_code", methods=["POST"])
def run_code():
    """ Run python 3 code """

    session['count'] += 1

    # Don't run too many times
    if slow(session["last_run_time"], session['count']):
        return jsonify({"alertUserAboutCooldown": True})

    if not "file_name" in session:
        with tempfile.NamedTemporaryFile(delete=False) as temp:
            session["file_name"] = temp.name

    # Get python output
    p1 = Popen(
        "python " + session["file_name"],
        shell=True,
        stdin=PIPE,
        stdout=PIPE,
        stderr=PIPE,
        close_fds=True,
    )

    stdout = p1.stdout.read().decode("utf-8")
    stderr = p1.stderr.read().decode("utf-8")
    p1.kill()
    session["last_run_time"] = datetime.now()

    answers_info = None
    summarized_answers = None
    pycee_answer = None
    
    if stderr:
        answers_info, pycee_answer = pycee(
            session["file_name"], stderr=stderr
        )

    return jsonify(
        {
            "output": stdout + stderr,
            "answers_info": [a._asdict() for a in answers_info] if answers_info else None,
            "pycee_answer": pycee_answer,
        }
    )


def slow(last_run_time, run_count):
    """ Set a 5 second interval to run code again.
    Also, don't check right after page load by checking run_count """


    timedelta = datetime.now() - last_run_time
    return timedelta.total_seconds() < 5 and run_count > 2
    


def pycee(file_path, stderr, n_questions=3, n_answers=3):
    """ run pycee to get a possible answer for the error """
    
    args = parse_args([
        file_path,
        "-q", str(n_questions),
        "-a", str(n_answers)
    ])
    error_info = get_error_info(args.file_name)
    query, pycee_answer, _ = handle_error(error_info, args)
    _, answers_info = get_answers(query, error_info, args)

    return answers_info, pycee_answer


def evaluate_pylint(text):
    """Create temp files for pylint parsing on user code

    :param text: user code
    :return: dictionary of pylint errors:
        {
            {
                "code":...,
                "error": ...,
                "message": ...,
                "line": ...,
                "error_info": ...,
            }
            ...
        }
    """
    # Open temp file for specific session.
    # IF it doesn't exist (aka the key doesn't exist), create one
    if "file_name" in session:
        f = open(session["file_name"], "w")
        for t in text:
            f.write(t)
        f.flush()
    else:
        with tempfile.NamedTemporaryFile(delete=False) as temp:
            session["file_name"] = temp.name
            for t in text:
                temp.write(t.encode("utf-8"))
            temp.flush()

    try:
        ARGS = " -r n --disable=R,C"
        (pylint_stdout, pylint_stderr) = lint.py_run(
            session["file_name"] + ARGS, return_std=True
        )
    except Exception as e:
        raise Exception(e)

    if pylint_stderr.getvalue():
        raise Exception("Issue with pylint configuration")

    return format_errors(pylint_stdout.getvalue())


# def split_error_gen(error):
#     """Inspired by this Python discussion: https://bugs.python.org/issue17343
#     Uses a generator to split error by token and save some space
#
#         :param error: string to be split
#         :yield: next line split by new line
#     """
#     for e in error.split():
#         yield e


def process_error(error):
    """Formats error message into dictionary

    :param error: pylint error full text
    :return: dictionary of error as:
        {
            "code":...,
            "error": ...,
            "message": ...,
            "line": ...,
            "error_info": ...,
        }
    """
    # Return None if not an error or warning
    if error == " " or error is None:
        return None
    if error.find("Your code has been rated at") > -1:
        return None

    list_words = error.split()
    if len(list_words) < 3:
        return None

    # Detect OS
    line_num = None
    if is_os_linux():
        try:
            line_num = error.split(":")[1]
        except Exception as e:
            print(os.name + " not compatible: " + e)
    else:
        line_num = error.split(":")[2]

    # list_words.pop(0)
    error_yet, message_yet, first_time = False, False, True
    i, length = 0, len(list_words)
    # error_code=None
    while i < length:
        word = list_words[i]
        if (word == "error" or word == "warning") and first_time:
            error_yet = True
            first_time = False
            i += 1
            continue
        if error_yet:
            error_code = word[1:-1]
            error_string = list_words[i + 1][:-1]
            i = i + 3
            error_yet = False
            message_yet = True
            continue
        if message_yet:
            full_message = " ".join(list_words[i : length - 1])
            break
        i += 1

    error_info = pylint_dict_final[error_code]

    return {
        "code": error_code,
        "error": error_string,
        "message": full_message,
        "line": line_num,
        "error_info": error_info,
    }


def format_errors(pylint_text):
    """Format errors into parsable nested dictionary

    :param pylint_text: original pylint output
    :return: dictionary of errors as:
        {
            {
                "code":...,
                "error": ...,
                "message": ...,
                "line": ...,
                "error_info": ...,
            }
            ...
        }
    """
    errors_list = pylint_text.splitlines(True)

    # If there is not an error, return nothing
    if (
        "--------------------------------------------------------------------"
        in errors_list[1]
        and "Your code has been rated at" in errors_list[2]
        and "module" not in errors_list[0]
    ):
        return None

    errors_list.pop(0)

    pylint_dict = {}
    try:
        pool = Pool(num_cores)
        pylint_dict = pool.map(process_error, errors_list)
    finally:
        pool.close()
        pool.join()
        return pylint_dict

    # count = 0
    # for error in errors_list:
    #     pylint_dict[count]=process_error(error)
    #     count +=1
    return pylint_dict


# def find_error(id):
#     """Find relevant info about pylint error
#
#     :param id: pylint error id
#     :return: returns error message description
#
#     pylint_errors.txt is the result from "pylint --list-msgs"
#     """
#     file = open('pylint_errors.txt', 'r')
#     s = mmap.mmap(file.fileno(), 0, access=mmap.ACCESS_READ)
#     location = s.find(id.encode())
#     if location != -1:
#         search_text = s[location:]
#         lines = search_text.splitlines(True)
#         error_message = []
#         for l in lines:
#             if l.startswith(':'.encode()):
#                 full_message = b''.join(error_message)
#                 full_message = full_message.decode('utf-8')
#                 replaced = id+"):"
#                 full_message = full_message.replace(replaced, "")
#                 full_message = full_message.replace("Used", "Occurs")
#                 return full_message
#             error_message.append(l)
#
#     return "No information at the moment"

def remove_temp_code_file():
    try:
        os.remove(session["file_name"])
    except FileNotFoundError:
        pass


@socketio.on("disconnect", namespace="/check_disconnect")
def disconnect():
    """Remove temp file associated with current session"""
    remove_temp_code_file()



if __name__ == "__main__":
    """Initialize app"""
    socketio.run(app)
