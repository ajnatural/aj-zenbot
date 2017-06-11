import random
from subprocess import CalledProcessError

from mock import patch, MagicMock

from main import main

def myoutput(cmdline):
    # print(cmdline)
    if random.random()<0.9:
        return str(random.random())
    else:
        raise CalledProcessError('a','b')
def test_integration():
    with patch('evaluation.runzen',myoutput) as cmd:
        with patch('evaluation.subprocess.check_output',myoutput):
            main('gdax.BTC-ETH',120)
