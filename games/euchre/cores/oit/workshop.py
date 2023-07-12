import numpy as np
import os
import pandas as pd
import sys
import time

from _euchre import EuchreConfig
from euchre.cores.oit.core_oit import EuchreCoreOIT, create_euchre_core_oit
from euchre.cores.oit.models import NNModels
from games.workshop import Workshop as BaseWorkshop, DirectRunner, LocalRunner

from tools import hdf5

euchre_dir = 'C:/Users/campb/data/euchre'

class EuchreCoreOITWorkshop(BaseWorkshop):
    project_name = 'euchre'

    def __init__(self, iter=None, stick_the_dealer=True, log_rule=None, max_rounds=0, load=True, seed=None):
        super().__init__(f'{iter}/{int(stick_the_dealer)}')

        self.load = load
        self.models = None
        
        seed = seed or int(time.time())
        self.runner_config = {
            'class': LocalRunner,
            'factory': create_euchre_core_oit,
            'args_list': [stick_the_dealer, max_rounds, False, seed]
        }
        self.config = EuchreConfig(*self.runner_config['args_list'])
        
        self.log_rule = None
        if log_rule is not None:
            self.log_rule = [log_rule(i) for i in range(self.config.N)]

    def initialize_runner(self, runner):
        if self.models is None:
            write_schema = self.run_params['groups_per_save_data'] > 0 or self.run_params['groups_per_evaluation_data'] > 0
            self.create_models(write_schema)

        if self.log_rule is not None:
            runner.core_command('set_log_rule', log_rule_array=self.log_rule)
        runner.wait_until_ready()
        
        runner.core_command('set_models', raw_models=self.models.get_raw_models())

    def create_models(self, write_schema):
        self.models = NNModels()
        dummy_core = EuchreCoreOIT(self.config)
        dummy_core.initialize()
        if self.load:
            self.models.load(self.model_dir)
        else:
            self.models.generate(dummy_core)
        self.models.load_schema(dummy_core, self.history_fname if write_schema else None)

    def run_group(self, f):
        # Set greeds
        greed = self.run_params['greeds'][f] if self.run_params.get('greeds', None) is not None else 1.0
        group_greeds = [greed] * self.config.N

        # Play games
        print(f"Game group {f}: greed = {greed}")
        for g in range(self.run_params['group_size']):
            name = f'{f}.{g}'
            log = None
            if self.run_params['game_log']:
                log = f'{self.log_dir}/game.{name}.txt'
            self.run_one_game(game_name=name, log=log, greeds=group_greeds, is_evaluation=False)
        self.wait_for_runners()

        # Gather data
        save_data = self.run_params['groups_per_save_data'] > 0 and (f + 1) % self.run_params['groups_per_save_data'] == 0
        if self.run_params['fit'] or save_data:
            print('Gathering data...')
            for runner in self.runners:
                runner.core_command('gather_data')
            self.wait_for_runners()
            self.models.take_data([runner.get_return_data() for runner in self.runners])
            if save_data:
                print('Writing data...')
                self.models.write_data(self.history_fname)
        else:
            for runner in self.runners:
                runner.core_command('clear_data')
            self.wait_for_runners()

        # Fit models
        if self.run_params['fit']:
            if f >= self.run_params['group_fit_window'] - 1:
                self.models.fit(self.run_params['epochs_per_fit'], self.run_params['batch_size'])
                if self.run_params['save']:
                    self.models.save(self.model_dir)
                    self.models.write_history(self.history_fname)
                self.models.pop_data()
                # Update runners' models
                for runner in self.runners:
                    runner.core_command('set_models', raw_models=self.models.get_raw_models())
                self.wait_for_runners()

        # Evaluate
        if self.run_params['groups_per_evaluation'] > 0 and (f + 1) % self.run_params['groups_per_evaluation'] == 0:
            print('Evaluation:')
            scores = pd.DataFrame(columns=['index', 'rotation', 'team', 'score']).set_index(['index', 'rotation', 'team']).score
            num_rotations = self.config.N // 2
            for rotation in range(num_rotations):
                rotated_greeds = [1.0 if i % num_rotations == rotation else 0.0 for i in range(self.config.N)]
                for h in range(self.run_params['evaluation_size']):
                    name = f'{f}.{rotation}.{h}'
                    log = None
                    if self.run_params['evaluation_log']:
                        log = f'{self.log_dir}/evaluation.{name}.txt'
                    self.run_one_game(game_name=name, log=log, greeds=rotated_greeds, is_evaluation=True)
                self.wait_for_runners()
                for runner in self.runners:
                    ret = runner.core_command('gather_scores')
                self.wait_for_runners()
                all_scores = []
                for runner in self.runners:
                    ret = runner.get_return_data()
                    if ret is not None:
                        all_scores += ret
                for h, runner_scores in enumerate(all_scores):
                    for team, score in enumerate(runner_scores):
                        scores.loc[h, rotation, team] = score
            scores = scores.reset_index()
            scores['rotated_team'] = (scores.team + num_rotations - scores.rotation) % num_rotations
            scores = scores.set_index(['rotation', 'index', 'rotated_team']).score.unstack(2)
            scores.columns = [f'score_{i}' for i in scores]
            scores['win'] = scores.score_0.eq(scores.max(axis=1)).astype(int)
            scores = scores.unstack(0).describe().T
            print(scores)
            scores = scores.stack()
            scores.index = ['_'.join(map(str, i)) for i in scores.index]
            scores = scores.to_frame().T

            if self.run_params['save']:
                hdf5.write_table(scores, self.history_fname, 'evaluation', mode='a')

        # Evaluation data
        if self.run_params['save'] and self.run_params['groups_per_evaluation_data'] > 0 and (f + 1) % self.run_params['groups_per_evaluation_data'] == 0:
            print('Evaluating data...')
            self.models.evaluate_data(self.history_fname)

        # Save to web
        if self.run_params['groups_per_save_to_web'] > 0 and (f + 1) % self.run_params['groups_per_save_to_web'] == 0:
            print('Saving to web...')
            self.models.save_for_web(self.web_dir)

### main

iter = 'oit_1'
job = 'fit'
process_loop = True
process_count = 1000
exploration_count = 0
greeds = np.concatenate([
    np.linspace(0, 0.95, exploration_count),
    np.full(process_count - exploration_count, 1.0)
])
group_count = 10

def run_process_loop():
    print('Starting process loop...')
    import subprocess

    for i, greed in enumerate(greeds):
        subprocess.run(f'{sys.prefix}/Scripts/activate & python {sys.argv[0]} {i} {greed}', shell=True, check=True)

def run_fit():
    import euchre

    process_num = int(sys.argv[1]) if len(sys.argv) > 1 else -1
    process_greed = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    print(f'Running process {process_num} with greed {process_greed}')
    workshop = euchre.EuchreCoreOITWorkshop(
        iter=iter,
        log_rule=None,
        max_rounds=0,
        load=os.path.exists(f'C:/Users/campb/data/euchre/{iter}/1/models/wnn')
    )
    workshop.run(
        group_count=group_count,
        fit=True,
        save=True,
        group_size=10,
        game_log=False,
        epochs_per_fit=1,
        group_fit_window=1,
        groups_per_evaluation=group_count,
        #groups_per_evaluation_data=group_count,
        evaluation_size=100,
        evaluation_log=False,
        #groups_per_save_data=group_count,
        groups_per_save_to_web=group_count,
        batch_size=32,
        greeds=[process_greed] * group_count,
        num_processes=10
    )

def run_test():
    import euchre

    workshop = euchre.EuchreCoreOITWorkshop(
        iter=iter,
        log_rule = lambda i: True, 
        max_rounds=0,
        #load=os.path.exists(f'C:/Users/campb/data/euchre/{iter}/1/models/wnn'),
        load=False,
        seed=420
    )
    workshop.run(
        group_count=1,
        game_log=True,
        fit=False,
        save=False,
        group_size=1,
        greeds=[1.0, 1.0, 1.0, 1.0],
        num_processes=1,
        groups_per_save_data=1,
    )

def regression_test():
    import euchre

    workshop = euchre.EuchreCoreOITWorkshop(
        iter=iter,
        log_rule = lambda i: True, 
        max_rounds=0,
        load=True,
        seed=420
    )
    workshop.run(
        group_count=1,
        game_log=True,
        fit=False,
        save=False,
        group_size=1,
        greeds=[1.0, 1.0, 1.0, 1.0],
        num_processes=1,
        groups_per_evaluation_data=1,
        groups_per_save_data=1,
    )

if __name__ == '__main__':
    if job == 'fit' and process_loop and len(sys.argv) == 1:
        run_process_loop()
    elif job == 'fit':
        run_fit()
    elif job == 'test':
        run_test()
    elif job == 'regression':
        regression_test()