import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CameraScreen } from './src/screens/CameraScreen';
import { ImageScreen } from './src/screens/ImageScreen';

const Tab = createBottomTabNavigator();

const App = () => {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="black" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: 'green',
            tabBarStyle: {
              backgroundColor: 'black',
              borderTopColor: 'gray',
            },
          }}
        >
          <Tab.Screen
            name="Camera"
            component={CameraScreen}
            options={{
              tabBarLabel: 'Camera',
            }}
          />
          <Tab.Screen
            name="Image"
            component={ImageScreen}
            options={{
              tabBarLabel: 'Image',
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
};

export default App;
