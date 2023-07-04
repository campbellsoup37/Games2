{
  'targets': [
    {
      'target_name': 'euchre',
      #'cflags_cc!': [ '-fno-rtti' ],
      'cflags_cc': [ '-frtti', '-fexceptions' ],
      'include_dirs': [
        '../games',
      ],
      'sources': [
          '../games/cards.cpp', 
          '../games/euchre/core.cpp', 
          '../games/ml.cpp', 
          '../games/euchre/cores/markov/core_markov.cpp', 
          '../games/euchre/cores/random/core_random.cpp',
          '../games/euchre/jseuchre.cpp'
      ],
      'conditions': [
        [
          'OS=="win"', {
            'configurations': {
              'Debug': {
                'msvs_settings': {
                  'VCCLCompilerTool': {
                    'RuntimeTypeInfo': 'true',
                    'ExceptionHandling': 1, 
                    'AdditionalOptions': [ '-std:c++20' ]
                  },
                }
              }, # Debug
              'Release': {
                'msvs_settings': {
                  'VCCLCompilerTool': {
                    'RuntimeTypeInfo': 'true',
                    'ExceptionHandling': 1, 
                    'AdditionalOptions': [ '-std:c++20' ]
                  },
                }
              }
            }
          }
        ]
      ]
    }
  ]
}