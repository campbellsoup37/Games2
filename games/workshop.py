import multiprocessing as mp
import os
import pandas as pd
import sys
import time
import threading

from tools import hdf5

class Workshop:
    project_name = 'misc'

    def __init__(self, iter=None):
        iter = iter or 'base'
        self.iter = iter
        self.runners = []
        self.ready_runners = set()
        self.run_params = {}
        self.runner_config = {}

    def create_runner(self):
        runner = self.runner_config['class'](f'runner_{len(self.runners)}', self, self.runner_config)
        runner.start()
        self.initialize_runner(runner)
        self.runners += [runner]

    def initialize_runner(self, runner):
        pass

    @property
    def project_dir(self):
        return f'C:/Users/campb/data/{self.project_name}'

    @property
    def base_dir(self):
        return f'{self.project_dir}/{self.iter}'

    @property
    def log_dir(self):
        return f'{self.base_dir}/logs'

    @property
    def model_dir(self):
        return f'{self.base_dir}/models'

    @property
    def web_dir(self):
        return f'{sys.prefix}/../web/models/{self.project_name}'

    @property
    def history_fname(self):
        return f'{self.base_dir}/history.h5'

    def run_one_game(self, **kwargs):
        while len(self.ready_runners) == 0:
            if len(self.runners) < self.run_params.get('num_processes', 1):
                self.create_runner()
            else:
                time.sleep(0.001)

        runner = self.ready_runners.pop()
        runner.core_command('run', **kwargs)

    def wait_for_runners(self):
        while len(self.ready_runners) != len(self.runners):
            time.sleep(0.001)

    def get_default_run_params(self):
        return {
            'group_count': 1, 
            'game_log': False,
            'fit': True, 
            'group_size': 1, 
            'epochs_per_fit': 1, 
            'group_fit_window': 1, 
            'groups_per_evaluation': 0, 
            'evaluation_size': 1, 
            'evaluation_log': False,
            'groups_per_save_data': 0, 
            'groups_per_evaluation_data': 0, 
            'batch_size': None, 
            'save': False, 
            'groups_per_save_to_web': 0, 
            'num_processes': 1
        }

    def run(self, **kwargs):
        self.run_params = self.get_default_run_params()
        for k, v in kwargs.items():
            self.run_params[k] = v

        if self.run_params['game_log'] or self.run_params['evaluation_log']:
            os.makedirs(self.log_dir, exist_ok=True)

        for f in range(self.run_params['group_count']):
            self.run_group(f)

        for runner in self.runners:
            runner.end()

    def run_group(self, f):
        pass

# DirectRunner

class DirectRunner:
    def __init__(self, name, workshop, runner_config):
        self.runner_name = name
        self.workshop = workshop
        self.ready = False
        self.core = runner_config['factory'](name, **runner_config)
        self.return_data = None

    def start(self):
        self.i_am_ready()

    def core_command(self, name, **args):
        self.return_data = getattr(self.core, name)(**args)
        self.i_am_ready()

    def end(self):
        pass

    def wait_until_ready(self):
        pass

    def get_return_data(self):
        data = self.return_data
        self.return_data = None
        return data

    def i_am_ready(self):
        self.ready = True
        self.workshop.ready_runners.add(self)

# LocalRunner

class LocalRunnerTarget:
    def __init__(self, name, connection, runner_config):
        self.runner_name = name
        self.connection = connection
        self.should_end = False
        self.core = runner_config['factory'](name, **runner_config)

    def main_loop(self):
        while not self.should_end:
            msg = self.connection.recv()
            return_data = self.handle_msg(msg)
            if return_data is not None:
                self.connection.send(return_data)

    def close(self):
        print(f'{self.runner_name} runner process ending...')
        self.connection.close()

    def handle_msg(self, msg):
        name = msg['name']
        del msg['name']
        return getattr(self, name)(msg)

    def ping(self, msg):
        t = time.time()
        print(f'ping received by {self.runner_name} process at time {t}. Pinging back...')
        return {'name': 'ping'}

    def core_command(self, msg):
        command_name = msg['command_name']
        del msg['command_name']
        return_data = getattr(self.core, command_name)(**msg)
        return {'name': command_name, 'return_data': return_data}

    def end(self, msg):
        self.should_end = True

def local_runner_target(runner_name, connection, runner_config):
    runner = LocalRunnerTarget(runner_name, connection, runner_config)
    runner.main_loop()
    runner.close()

class LocalRunner:
    def __init__(self, name, workshop, runner_config):
        self.runner_name = name
        self.workshop = workshop
        self.connection, connection = mp.Pipe()
        self.process = mp.Process(target=local_runner_target, args=(name, connection, runner_config))
        self.ready = False

        def listener_loop():
            should_end = False
            while not should_end:
                #msg = self.connection.recv()
                #self.handle_return_msg(msg)
                try:
                    msg = self.connection.recv()
                    self.handle_return_msg(msg)
                except Exception:
                    should_end = True
            print(f'{name} listener thread ending...')
        self.listener_thread = threading.Thread(target=listener_loop)

        self.return_data = None

    def start(self):
        self.process.start()
        self.listener_thread.start()
        self.i_am_ready()

    def send(self, name, **args):
        self.i_am_not_ready()
        args['name'] = name
        self.connection.send(args)

    def core_command(self, name, **args):
        args['command_name'] = name
        self.send('core_command', **args)

    def end(self):
        self.connection.send({'name': 'end'})
        self.connection.close()
        self.listener_thread.join()
        self.process.join()

    def get_return_data(self):
        data = self.return_data
        self.return_data = None
        return data

    def handle_return_msg(self, msg):
        self.return_data = msg.get('return_data', None)
        if hasattr(self, msg['name']):
            getattr(self, msg['name'])(msg)
        self.i_am_ready()

    def i_am_ready(self):
        self.ready = True
        self.workshop.ready_runners.add(self)

    def i_am_not_ready(self):
        self.ready = False
        if self in self.workshop.ready_runners:
            self.workshop.ready_runners.remove(self)

    def wait_until_ready(self):
        while not self.ready:
            time.sleep(0.001)

    def ping(self, msg):
        t = time.time()
        print(f'ping received by {self.runner_name} listener thread at time {t}.')