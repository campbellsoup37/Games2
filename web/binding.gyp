{
  'targets': [
    {
      'target_name': 'euchre',
      #'cflags_cc!': [ '-fno-rtti' ],
      #'cflags_cc+': [ '-frtti' ],
      'include_dirs': [
        '../games',
      ],
      'msvs_settings': {
        'VCCLCompilerTool': { 'ExceptionHandling': 1, 'AdditionalOptions': [ '-std:c++20' ] }
      },
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
                  },
                }
              }, # Debug
              'Release': {
                'msvs_settings': {
                  'VCCLCompilerTool': {
                    'RuntimeTypeInfo': 'true',
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