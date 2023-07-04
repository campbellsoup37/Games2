#include <node.h>
#include <node_object_wrap.h>

#include "cores/markov/core_markov.h"
#include "cores/random/core_random.h"

inline v8::Local<v8::String> v8String(v8::Isolate* isolate, const std::string& str) {
#ifdef _WIN32
    return v8::String::NewFromUtf8(isolate, str.c_str()).ToLocalChecked();
#else
    return v8::String::NewFromUtf8(isolate, str.c_str());
#endif
}

template<typename CoreType, std::string& className>
class JsEuchreCore : public node::ObjectWrap {
public:
    static void Init(v8::Local<v8::Object> exports);

    std::unique_ptr<CoreType> core;
protected:
    JsEuchreCore() {}
    JsEuchreCore(EuchreConfig config) {
        core = std::make_unique<CoreType>(config);
        core->initialize();
    }

    void init(v8::Local<v8::Object> exports);
    virtual void createPrototype(v8::Local<v8::FunctionTemplate>& tpl);

    static void New(const v8::FunctionCallbackInfo<v8::Value>& args);

    static void run(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void gameSetup(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void deal(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void chooseTrump(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void applyTrumpChoice(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void orderUp(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void makeDiscard(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void getCardPlay(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void playCard(const v8::FunctionCallbackInfo<v8::Value>& args);
    static void whatCanIPlay(const v8::FunctionCallbackInfo<v8::Value>& args);
};

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::init(v8::Local<v8::Object> exports) {
    v8::Isolate* isolate = exports->GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    v8::Local<v8::ObjectTemplate> addon_data_tpl = v8::ObjectTemplate::New(isolate);
    addon_data_tpl->SetInternalFieldCount(1);
    v8::Local<v8::Object> addon_data = addon_data_tpl->NewInstance(context).ToLocalChecked();

    // Prepare constructor template
    v8::Local<v8::FunctionTemplate> tpl = v8::FunctionTemplate::New(isolate, New, addon_data);
    tpl->SetClassName(v8String(isolate, className));
    tpl->InstanceTemplate()->SetInternalFieldCount(1);

    createPrototype(tpl);

    v8::Local<v8::Function> constructor = tpl->GetFunction(context).ToLocalChecked();
    addon_data->SetInternalField(0, constructor);
    exports->Set(context, v8String(isolate, className), constructor).FromJust();
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::createPrototype(v8::Local<v8::FunctionTemplate>& tpl) {
    NODE_SET_PROTOTYPE_METHOD(tpl, "run", run);
    NODE_SET_PROTOTYPE_METHOD(tpl, "gameSetup", gameSetup);
    NODE_SET_PROTOTYPE_METHOD(tpl, "deal", deal);
    NODE_SET_PROTOTYPE_METHOD(tpl, "chooseTrump", chooseTrump);
    NODE_SET_PROTOTYPE_METHOD(tpl, "applyTrumpChoice", applyTrumpChoice);
    NODE_SET_PROTOTYPE_METHOD(tpl, "orderUp", orderUp);
    NODE_SET_PROTOTYPE_METHOD(tpl, "makeDiscard", makeDiscard);
    NODE_SET_PROTOTYPE_METHOD(tpl, "getCardPlay", getCardPlay);
    NODE_SET_PROTOTYPE_METHOD(tpl, "playCard", playCard);
    NODE_SET_PROTOTYPE_METHOD(tpl, "whatCanIPlay", whatCanIPlay);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::Init(v8::Local<v8::Object> exports) {
    JsEuchreCore<CoreType, className> dummy;
    dummy.init(exports);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::New(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    bool stickTheDealer = true;
    int maxRounds = args[0]->NumberValue(context).FromMaybe(0);
    unsigned int seed = args[1]->NumberValue(context).FromMaybe(0);

    EuchreConfig config{ stickTheDealer, maxRounds, seed };

    JsEuchreCore<CoreType, className>* obj = new JsEuchreCore<CoreType, className>(config);
    obj->Wrap(args.This());

    bool log = args[2]->IsUndefined() ? false : args[2]->BooleanValue(isolate);
    if (log) {
        std::string fname = "C:/Users/campb/data/euchre/test/1/logs_from_web/log.txt";
        obj->core->log.openFile(fname);
    }
    if (!args[3]->IsUndefined()) {
        auto logRule = args[3]->ToObject(context).ToLocalChecked();
        for (int i = 0; i < obj->core->config.N; i++) {
            dynamic_cast<EuchrePlayerMarkov*>(&*obj->core->players[i])->shouldLog = logRule->Get(context, i).ToLocalChecked()->BooleanValue(isolate);
        }
    }

    args.GetReturnValue().Set(args.This());
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::run(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->run("");
    
    std::vector<int>& scoresCpp = obj->core->scores;
    v8::Local<v8::Array> scores = v8::Array::New(isolate, scoresCpp.size());
    for (int i = 0; i < (int)scoresCpp.size(); i++) {
        scores->Set(context, i, v8::Number::New(isolate, scoresCpp[i]));
    }

    args.GetReturnValue().Set(scores);
}

// Setup

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::gameSetup(const v8::FunctionCallbackInfo<v8::Value>& args) {
    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->gameSetup();
}

// Deal

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::deal(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    obj->core->dealSetup();
    obj->core->deal();
    obj->core->chooseTrumpSetup();

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);

    // hands
    v8::Local<v8::Array> hands = v8::Array::New(isolate, obj->core->config.N);
    for (int i = 0; i < obj->core->config.N; i++) {
        auto& player = obj->core->players[i];
        v8::Local<v8::Array> hand = v8::Array::New(isolate, obj->core->config.h);
        int j = 0;
        for (auto& card : player->hand) {
            hand->Set(context, j, v8::Number::New(isolate, card.code));
            j++;
        }
        hands->Set(context, i, hand);
    }
    ret->Set(context, v8String(isolate, "hands"), hands);
    ret->Set(context, v8String(isolate, "upCard"), v8::Number::New(isolate, obj->core->upCard.code));
    int dealer = obj->core->roundNumber % obj->core->config.N;
    ret->Set(context, v8String(isolate, "dealer"), v8::Number::New(isolate, dealer));
    ret->Set(context, v8String(isolate, "leader"), v8::Number::New(isolate, obj->core->leader));

    args.GetReturnValue().Set(ret);
}

// Trump

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::chooseTrump(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int index = (obj->core->leader + obj->core->trumpIndex) % obj->core->config.N;
    TrumpChoice& choice = obj->core->getTrumpChoice(index);

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "index"), v8::Number::New(isolate, index));
    ret->Set(context, v8String(isolate, "pass"), v8::Boolean::New(isolate, choice.pass));
    ret->Set(context, v8String(isolate, "suit"), v8::Number::New(isolate, choice.suit));
    ret->Set(context, v8String(isolate, "alone"), v8::Boolean::New(isolate, choice.alone));

    args.GetReturnValue().Set(ret);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::applyTrumpChoice(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    TrumpChoice choice;

    auto choiceJs = args[0]->ToObject(context).ToLocalChecked();
    bool pass = choiceJs->Get(context, v8String(isolate, "pass")).ToLocalChecked()->BooleanValue(isolate);
    if (!pass) {
        int suit = choiceJs->Get(context, v8String(isolate, "suit")).ToLocalChecked()->NumberValue(context).FromMaybe(0);
        bool alone = choiceJs->Get(context, v8String(isolate, "alone")).ToLocalChecked()->BooleanValue(isolate);
        choice = TrumpChoice(suit, alone);
    }

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    EuchreTrumpPhase prevPhase = obj->core->trumpPhase;
    int index = (obj->core->leader + obj->core->trumpIndex) % obj->core->config.N;
    obj->core->applyTrumpChoice(index, choice);
    obj->core->trumpChoiceApplied(index, choice);
    int turn = (obj->core->leader + obj->core->trumpIndex) % obj->core->config.N;
    if (prevPhase == EuchreTrumpPhase::DOWN && obj->core->trumpPhase == EuchreTrumpPhase::DECLARED) {
        // if we bypass the discard step
        obj->core->playSetup();
        turn = (obj->core->leader + obj->core->playIndex) % obj->core->config.N;
    }

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "phase"), v8::Number::New(isolate, (int)obj->core->trumpPhase));
    ret->Set(context, v8String(isolate, "trump"), v8::Number::New(isolate, (int)obj->core->trump));
    ret->Set(context, v8String(isolate, "alone"), v8::Boolean::New(isolate, obj->core->alone));
    ret->Set(context, v8String(isolate, "declarer"), v8::Number::New(isolate, (int)obj->core->declarer));
    ret->Set(context, v8String(isolate, "orderedUp"), v8::Boolean::New(isolate, obj->core->orderedUp));
    ret->Set(context, v8String(isolate, "turn"), v8::Number::New(isolate, turn));

    args.GetReturnValue().Set(ret);
}

// Order up

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::orderUp(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int dealer = obj->core->roundNumber % obj->core->config.N;
    Card& discard = obj->core->getDiscard(dealer);

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "discard"), v8::Number::New(isolate, discard.code));

    args.GetReturnValue().Set(ret);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::makeDiscard(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    Card discard(args[0]->NumberValue(context).FromMaybe(0));

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int dealer = obj->core->roundNumber % obj->core->config.N;
    obj->core->discard(dealer, discard);
    obj->core->discarded(dealer, discard);
    obj->core->playSetup();

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "turn"), v8::Number::New(isolate, (obj->core->leader + obj->core->playIndex) % obj->core->config.N));

    args.GetReturnValue().Set(ret);
}

// Play

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::getCardPlay(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int index = (obj->core->leader + obj->core->playIndex) % obj->core->config.N;
    Card& card = obj->core->getCardPlay(index);

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "card"), v8::Number::New(isolate, card.code));

    args.GetReturnValue().Set(ret);
}

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::playCard(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    Card card(args[0]->NumberValue(context).FromMaybe(0));

    // Game flow
    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int index = (obj->core->leader + obj->core->playIndex) % obj->core->config.N;
    obj->core->playCard(index, card);
    int trickWinner = obj->core->trickWinner();
    obj->core->cardPlayed(index, card);
    if (obj->core->roundResult != EuchreRoundResult::UNFINISHED) {
        obj->core->scored();
    }

    if (obj->core->gameOver && obj->core->log.logging) {
        obj->core->log.closeFile();
    }

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    ret->Set(context, v8String(isolate, "turn"), v8::Number::New(isolate, (obj->core->leader + obj->core->playIndex) % obj->core->config.N));
    ret->Set(context, v8String(isolate, "trickWinner"), v8::Number::New(isolate, trickWinner));
    ret->Set(context, v8String(isolate, "roundResult"), v8::Number::New(isolate, (int)obj->core->roundResult));
    v8::Local<v8::Array> scores = v8::Array::New(isolate, obj->core->scores.size());
    for (int j = 0; j < (int)obj->core->scores.size(); j++) {
        scores->Set(context, j, v8::Number::New(isolate, obj->core->scores[j]));
    }
    ret->Set(context, v8String(isolate, "scores"), scores);
    ret->Set(context, v8String(isolate, "gameOver"), v8::Boolean::New(isolate, obj->core->gameOver));

    args.GetReturnValue().Set(ret);
}

// Other

template<typename CoreType, std::string& className>
void JsEuchreCore<CoreType, className>::whatCanIPlay(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    JsEuchreCore<CoreType, className>* obj = ObjectWrap::Unwrap<JsEuchreCore<CoreType, className>>(args.Holder());
    int index = (obj->core->leader + obj->core->playIndex) % obj->core->config.N;
    auto& player = obj->core->players[index];
    std::vector<const Card*> canPlay;
    obj->core->whatCanIPlay(player->hand, canPlay);

    // Return data
    v8::Local<v8::Object> ret = v8::Object::New(isolate);
    v8::Local<v8::Array> canPlayJs = v8::Array::New(isolate, canPlay.size());
    int j = 0;
    for (auto& card : canPlay) {
        canPlayJs->Set(context, j, v8::Number::New(isolate, card->code));
        j++;
    }
    ret->Set(context, v8String(isolate, "canPlay"), canPlayJs);

    args.GetReturnValue().Set(ret);
}

std::string JsEuchreCoreRandomClassName = "EuchreCoreRandom";
using JsEuchreCoreRandom = JsEuchreCore<EuchreCoreRandom, JsEuchreCoreRandomClassName>;

std::string JsEuchreCoreMarkovClassName = "EuchreCoreMarkov";
class JsEuchreCoreMarkov : public JsEuchreCore<EuchreCoreMarkov, JsEuchreCoreMarkovClassName> {
public:
    static void Init(v8::Local<v8::Object> exports);

private:
    void createPrototype(v8::Local<v8::FunctionTemplate>& tpl) override;

    static void setWeights(const v8::FunctionCallbackInfo<v8::Value>& args);
};

void JsEuchreCoreMarkov::createPrototype(v8::Local<v8::FunctionTemplate>& tpl) {
    JsEuchreCore<EuchreCoreMarkov, JsEuchreCoreMarkovClassName>::createPrototype(tpl);
    NODE_SET_PROTOTYPE_METHOD(tpl, "setWeights", setWeights);
}

void JsEuchreCoreMarkov::Init(v8::Local<v8::Object> exports) {
    JsEuchreCoreMarkov dummy;
    dummy.init(exports);
}

void copyWeights(NeuralNetwork& nn, v8::Local<v8::Object> weightsDict, v8::Isolate* isolate, v8::Local<v8::Context> context) {
    auto weightsList = weightsDict->Get(context, v8String(isolate, nn.name)).ToLocalChecked()->ToObject(context).ToLocalChecked();
    int numLayers = weightsList->Get(context, v8String(isolate, "length")).ToLocalChecked()->NumberValue(context).FromMaybe(0);
    for (int i = 0; i < numLayers; i++) {
        std::string act = i == numLayers - 1 ? "softmax" : "relu";
        nn.layers.emplace_back(act);
        Layer& layer = nn.layers.back();

        auto layerJs = weightsList->Get(context, i).ToLocalChecked()->ToObject(context).ToLocalChecked();

        auto MJs = layerJs->Get(context, 0).ToLocalChecked()->ToObject(context).ToLocalChecked();
        auto bJs = layerJs->Get(context, 1).ToLocalChecked()->ToObject(context).ToLocalChecked();

        int numRows = MJs->Get(context, v8String(isolate, "length")).ToLocalChecked()->NumberValue(context).FromMaybe(0);
        for (int j = 0; j < numRows; j++) {
            layer.M.emplace_back();
            std::vector<double>& row = layer.M.back();

            auto rowJs = MJs->Get(context, j).ToLocalChecked()->ToObject(context).ToLocalChecked();
            int numCols = rowJs->Get(context, v8String(isolate, "length")).ToLocalChecked()->NumberValue(context).FromMaybe(0);
            for (int k = 0; k < numCols; k++) {
                double weight = rowJs->Get(context, k).ToLocalChecked()->NumberValue(context).FromMaybe(0);
                row.emplace_back(weight);
            }

            double weight = bJs->Get(context, j).ToLocalChecked()->NumberValue(context).FromMaybe(0);
            layer.b.emplace_back(weight);
        }
    }
}

void JsEuchreCoreMarkov::setWeights(const v8::FunctionCallbackInfo<v8::Value>& args) {
    v8::Isolate* isolate = args.GetIsolate();
    v8::Local<v8::Context> context = isolate->GetCurrentContext();

    JsEuchreCore<EuchreCoreMarkov, JsEuchreCoreMarkovClassName>* obj = ObjectWrap::Unwrap<JsEuchreCore<EuchreCoreMarkov, JsEuchreCoreMarkovClassName>>(args.Holder());

    auto weightsDict = args[0]->ToObject(context).ToLocalChecked();

    copyWeights(obj->core->tnn, weightsDict, isolate, context);
    copyWeights(obj->core->pnn, weightsDict, isolate, context);
    copyWeights(obj->core->rnn, weightsDict, isolate, context);
    copyWeights(obj->core->wnn, weightsDict, isolate, context);
}

void InitAll(v8::Local<v8::Object> exports) {
    JsEuchreCoreRandom::Init(exports);
    JsEuchreCoreMarkov::Init(exports);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, InitAll)
