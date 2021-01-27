from datetime import datetime
import pkgutil

import pytest
import pycee
import PythonBuddy.app


@pytest.fixture
def code_file(tmp_path):
    d = tmp_path / "tmp"
    d.mkdir()
    f = d / "test.py"
    f.write_text("for i in range(10)\n    print('Hello world')")

    return f

def test_pycee_is_isntalled():
    """ Assert pycee was installed as a requirement """
    assert pckgutil.find_loader('pycee')


def test_pycee_integration_syntax_error(monkeypatch, code_file):
    """ Assure pycee is working properly testing an SyntaxError"""

    mock_new_session = {"count": 0, "last_run_time": datetime.now(), "file_name":str(code_file)}
    mock_answer_info = [
            pycee.utils.Answer(
                accepted=True,
                author='paxdiablo',
                body='<p>foo bar</p>\n', 
                id=24237160,
                profile_image='foo.com',
                score=78
            )
        ]
    mock_pycee_answer = "pycee message for SyntaxError"
    

    def mock_pycee(file_path, stderr, n_questions=3, n_answers=3):    
        return mock_answer_info, mock_pycee_answer

    monkeypatch.setattr("PythonBuddy.app.pycee", mock_pycee)
    monkeypatch.setattr("PythonBuddy.app.session", mock_new_session)

    client = PythonBuddy.app.app.test_client()
    run_code_request = client.post('/run_code', data={"text": code_file.read_text()})
    response = run_code_request.get_json()
    
    assert [a._asdict() for a in mock_answer_info] == response['answers_info']
    assert mock_pycee_answer == response['pycee_answer']

