import multiprocessing as mp
import threading
import time

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
        self.i_am_ready()

    def start(self):
        self.process.start()
        self.listener_thread.start()

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