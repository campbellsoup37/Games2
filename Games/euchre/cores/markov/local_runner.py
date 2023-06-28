import multiprocessing as mp
import threading
import time

from _euchre import EuchreConfig
from euchre.cores.markov.core_markov import EuchreCoreMarkov

def local_runner_target(runner_name, configArgs, connection):
    configCpp = EuchreConfig(*configArgs)
    core = EuchreCoreMarkov(configCpp)
    core.initialize()
    should_end = False

    def handle_msg(msg):
        name = msg['name']

        if name == 'ping':
            t = time.time()
            print(f'ping received by {runner_name} process at time {t}. Pinging back...')
            connection.send({'name': 'ping'})

        elif name == 'set_log_rule':
            core.set_log_rule(msg['log_rule_array'])

        elif name == 'set_models':
            core.set_models(msg['raw_models'])

        elif name == 'run':
            log = msg['log'] or ''
            greeds = msg['greeds'] or [1.0] * core.config.N
            t0 = time.time()
            core.set_greeds(greeds)
            core.run(log)
            t1 = time.time()
            print(f'Game {msg["game_name"]} done in {int(t1 - t0)} seconds by {runner_name}')
            if msg['is_evaluation']:
                core.clearData()
                connection.send({'name': 'scores', 'scores': core.scores})
            else:
                connection.send({'name': 'ready'})

        elif msg['name'] == 'gather_data':
            inOuts = core.gather_data()
            connection.send({'name': 'data', 'inOuts': inOuts})

        elif msg['name'] == 'clear_data':
            core.clearData()
            connection.send({'name': 'ready'})

        elif msg['name'] == 'end':
            return True

        return False

    while not should_end:
        msg = connection.recv()
        should_end = handle_msg(msg)
            
    print(f'{runner_name} runner process ending...')
    connection.close()

class LocalRunner:
    def __init__(self, name, config, workshop):
        self.runner_name = name
        self.workshop = workshop
        self.connection, connection = mp.Pipe()
        self.process = mp.Process(target=local_runner_target, args=(name, config, connection))

        def listener_loop():
            should_end = False
            while not should_end:
                try:
                    msg = self.connection.recv()
                    self.handle_msg(msg)
                except Exception:
                    should_end = True
            print(f'{name} listener thread ending...')
        self.listener_thread = threading.Thread(target=listener_loop)

        self.inOuts = None
        self.scores = []

    def start(self):
        self.process.start()
        self.listener_thread.start()

    def ping(self):
        self.connection.send({'name': 'ping'})

    def set_log_rule(self, log_rule_array):
        self.connection.send({'name': 'set_log_rule', 'log_rule_array': log_rule_array})

    def set_models(self, models):
        self.connection.send({'name': 'set_models', 'raw_models': models.get_raw_models()})

    def run(self, game_name, log, greeds, is_evaluation=False):
        self.connection.send({'name': 'run', 'game_name': game_name, 'log': log, 'greeds': greeds, 'is_evaluation': is_evaluation})

    def gather_data(self):
        self.connection.send({'name': 'gather_data'})

    def clear_data(self):
        self.connection.send({'name': 'clear_data'})

    def end(self):
        self.connection.send({'name': 'end'})
        self.connection.close()
        self.listener_thread.join()
        self.process.join()

    def handle_msg(self, msg):
        name = msg['name']

        if name == 'ping':
            t = time.time()
            print(f'ping received by {self.runner_name} listener thread at time {t}.')

        elif name == 'ready':
            self.workshop.ready_runners.add(self)

        elif name == 'data':
            self.inOuts = msg['inOuts']
            self.workshop.ready_runners.add(self)

        elif name == 'scores':
            self.scores += [msg['scores']]
            self.workshop.ready_runners.add(self)