#pragma once

#include <fstream>
#include <sstream>
#include <stack>
#include <vector>

enum LogItem { DICT = 0, LIST = 1 };

class Log {
public:
	void openFile(std::string fname) {
		out.open(fname);
		logging = true;
		open(LogItem::DICT, false);
	}

	void closeFile() {
		while (stack.size() > 0) {
			close();
		}
		out.close();
		logging = false;
	}

	void open(LogItem type, bool flat) {
		switch (type) {
		case DICT:
			out << "{";
			break;
		case LIST:
			out << "[";
			break;
		}
		stack.push(type);
		this->flat.push(flat);
		tabs += "  ";
		comma = false;
	}

	void commaAndTabs(bool closing) {
		if (comma && !closing) {
			out << ",";
		}
		if (!flat.top() && (!closing || comma)) {
			out << "\n" << tabs;
		}
	}

	void openDict() {
		commaAndTabs(false);
		open(LogItem::DICT, false);
	}

	template<typename T>
	void openDict(const T& key) {
		commaAndTabs(false);
		out << "\"" << key << "\":";
		open(LogItem::DICT, false);
	}

	void openFlatDict() {
		commaAndTabs(false);
		open(LogItem::DICT, true);
	}

	template<typename T>
	void openFlatDict(const T& key) {
		commaAndTabs(false);
		out << "\"" << key << "\":";
		open(LogItem::DICT, true);
	}

	void openList() {
		commaAndTabs(false);
		open(LogItem::LIST, false);
	}

	template<typename T>
	void openList(const T& key) {
		commaAndTabs(false);
		out << "\"" << key << "\":";
		open(LogItem::LIST, false);
	}

	void openFlatList() {
		commaAndTabs(false);
		open(LogItem::LIST, true);
	}

	template<typename T>
	void openFlatList(const T& key) {
		commaAndTabs(false);
		out << "\"" << key << "\":";
		open(LogItem::LIST, true);
	}

	template<typename T>
	void write(const T& value) {
		commaAndTabs(false);
		out << "\"" << value << "\"";
		comma = true;
	}

	template<typename T, typename U>
	void write(const T& key, const U& value) {
		commaAndTabs(false);
		out << "\"" << key << "\":" << "\"" << value << "\"";
		comma = true;
	}

	void close() {
		tabs.erase(tabs.size() - 2, 2);
		commaAndTabs(true);
		switch (stack.top()) {
		case DICT:
			out << "}";
			break;
		case LIST:
			out << "]";
			break;
		}
		stack.pop();
		flat.pop();
		comma = true;
	}

	std::ofstream out;
	bool logging = false;
	std::stack<LogItem> stack;
	std::stack<bool> flat;
	bool comma = false;
	std::string tabs;
};